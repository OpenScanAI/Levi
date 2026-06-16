import { Command } from "commander";
import pc from "picocolors";
import {
  applyPendingMigrations,
  createDb,
  createEmbeddedPostgresLogBuffer,
  ensurePostgresDatabase,
  formatEmbeddedPostgresError,
} from "@paperclipai/db";
import { migrateHistoricalData } from "@paperclipai/server";
import { createMemoryService } from "@paperclipai/server";
import { loadPaperclipEnvFile } from "../config/env.js";
import { readConfig, resolveConfigPath } from "../config/store.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

type MemoryMigrateOptions = {
  config?: string;
  dataDir?: string;
  company: string;
  json?: boolean;
};

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

type EmbeddedPostgresHandle = {
  port: number;
  startedByThisProcess: boolean;
  stop: () => Promise<void>;
};

type ClosableDb = ReturnType<typeof createDb> & {
  $client?: {
    end?: (options?: { timeout?: number }) => Promise<void>;
  };
};

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function ensureEmbeddedPostgres(dataDir: string, preferredPort: number): Promise<EmbeddedPostgresHandle> {
  const moduleName = "embedded-postgres";
  let EmbeddedPostgres: EmbeddedPostgresCtor;
  try {
    const mod = await import(moduleName);
    EmbeddedPostgres = mod.default as EmbeddedPostgresCtor;
  } catch {
    throw new Error(
      "Embedded PostgreSQL support requires dependency `embedded-postgres`. Reinstall dependencies and try again.",
    );
  }

  const fs = await import("node:fs");
  const path = await import("node:path");
  const postmasterPidFile = path.resolve(dataDir, "postmaster.pid");

  function readRunningPostmasterPid(): number | null {
    if (!fs.existsSync(postmasterPidFile)) return null;
    try {
      const pid = Number(fs.readFileSync(postmasterPidFile, "utf8").split("\n")[0]?.trim());
      if (!Number.isInteger(pid) || pid <= 0) return null;
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  }

  function readPidFilePort(): number | null {
    if (!fs.existsSync(postmasterPidFile)) return null;
    try {
      const lines = fs.readFileSync(postmasterPidFile, "utf8").split("\n");
      const port = Number(lines[3]?.trim());
      return Number.isInteger(port) && port > 0 ? port : null;
    } catch {
      return null;
    }
  }

  const runningPid = readRunningPostmasterPid();
  if (runningPid) {
    return {
      port: readPidFilePort() ?? preferredPort,
      startedByThisProcess: false,
      stop: async () => {},
    };
  }

  const net = await import("node:net");
  const port = await new Promise<number>((resolve) => {
    let p = Math.max(1, Math.trunc(preferredPort));
    function tryPort(): void {
      const server = net.createServer();
      server.unref();
      server.once("error", () => {
        p += 1;
        tryPort();
      });
      server.listen(p, "127.0.0.1", () => {
        server.close(() => resolve(p));
      });
    }
    tryPort();
  });

  const logBuffer = createEmbeddedPostgresLogBuffer();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: logBuffer.append,
    onError: logBuffer.append,
  });

  if (!fs.existsSync(path.resolve(dataDir, "PG_VERSION"))) {
    try {
      await instance.initialise();
    } catch (error) {
      throw formatEmbeddedPostgresError(error, {
        fallbackMessage: `Failed to initialize embedded PostgreSQL cluster in ${dataDir} on port ${port}`,
        recentLogs: logBuffer.getRecentLogs(),
      });
    }
  }

  if (fs.existsSync(postmasterPidFile)) {
    fs.rmSync(postmasterPidFile, { force: true });
  }

  try {
    await instance.start();
  } catch (error) {
    throw formatEmbeddedPostgresError(error, {
      fallbackMessage: `Failed to start embedded PostgreSQL on port ${port}`,
      recentLogs: logBuffer.getRecentLogs(),
    });
  }

  return {
    port,
    startedByThisProcess: true,
    stop: async () => {
      await instance.stop();
    },
  };
}

async function closeDb(db: ClosableDb): Promise<void> {
  await db.$client?.end?.({ timeout: 5 }).catch(() => undefined);
}

async function openConfiguredDb(configPath: string): Promise<{
  db: ClosableDb;
  stop: () => Promise<void>;
}> {
  const config = readConfig(configPath);
  if (!config) {
    throw new Error(`Config not found at ${configPath}.`);
  }

  let embeddedHandle: EmbeddedPostgresHandle | null = null;
  try {
    if (config.database.mode === "embedded-postgres") {
      embeddedHandle = await ensureEmbeddedPostgres(
        config.database.embeddedPostgresDataDir,
        config.database.embeddedPostgresPort,
      );
      const adminConnectionString = `postgres://paperclip:***@127.0.0.1:${embeddedHandle.port}/postgres`;
      await ensurePostgresDatabase(adminConnectionString, "paperclip");
      const connectionString = `postgres://paperclip:***@127.0.0.1:${embeddedHandle.port}/paperclip`;
      await applyPendingMigrations(connectionString);
      const db = createDb(connectionString) as ClosableDb;
      return {
        db,
        stop: async () => {
          await closeDb(db);
          if (embeddedHandle?.startedByThisProcess) {
            await embeddedHandle.stop().catch(() => undefined);
          }
        },
      };
    }

    const connectionString = nonEmpty(config.database.connectionString);
    if (!connectionString) {
      throw new Error(`Config at ${configPath} does not define a database connection string.`);
    }

    await applyPendingMigrations(connectionString);
    const db = createDb(connectionString) as ClosableDb;
    return {
      db,
      stop: async () => {
        await closeDb(db);
      },
    };
  } catch (error) {
    if (embeddedHandle?.startedByThisProcess) {
      await embeddedHandle.stop().catch(() => undefined);
    }
    throw error;
  }
}

export async function memoryMigrateCommand(opts: MemoryMigrateOptions): Promise<void> {
  printPaperclipCliBanner();

  const companyId = nonEmpty(opts.company);
  if (!companyId) {
    throw new Error("Company ID is required. Pass --company <id>.");
  }

  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  console.log(pc.dim(`Config: ${configPath}`));
  console.log(pc.dim(`Company: ${companyId}`));
  console.log("");

  let db: ClosableDb | null = null;
  let stopDb: (() => Promise<void>) | null = null;

  try {
    const handle = await openConfiguredDb(configPath);
    db = handle.db;
    stopDb = handle.stop;

    const memoryService = createMemoryService({ enabled: true });

    console.log(pc.cyan("Starting historical memory migration..."));
    console.log("");

    const result = await migrateHistoricalData(companyId, db, memoryService);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(pc.green(`✓ Migration complete. ${result.migratedCount} memories migrated.`));

    if (result.errors.length > 0) {
      console.log("");
      console.log(pc.yellow(`Warning: ${result.errors.length} error(s) occurred during migration:`));
      for (const error of result.errors) {
        console.log(pc.yellow(`  - ${error}`));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Migration failed: ${message}`));
    throw err;
  } finally {
    if (stopDb) {
      await stopDb().catch(() => undefined);
    }
  }
}

export function registerMemoryMigrateCommands(program: Command): void {
  const memory = program.command("memory").description("Memory management commands");

  memory
    .command("migrate")
    .description("Migrate historical data (tasks, comments, error runs) into agentmemory")
    .requiredOption("--company <id>", "Company ID to migrate memories for")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", "Paperclip data directory root (isolates state from ~/.paperclip)")
    .option("--json", "Output raw JSON")
    .action(async (opts: MemoryMigrateOptions) => {
      try {
        await memoryMigrateCommand(opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(pc.red(message));
        process.exit(1);
      }
    });
}
