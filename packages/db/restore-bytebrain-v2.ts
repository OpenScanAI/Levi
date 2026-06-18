import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import { createInterface } from "readline";
import postgres from "postgres";

const STATEMENT_BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900";
const BACKUP_FILE = "/home/daksh/.paperclip/instances/default/data/backups/paperclip-20260527-132203.sql.gz";

async function* readRestoreStatements(backupFile: string): AsyncGenerator<string> {
  const raw = createReadStream(backupFile);
  const stream = raw.pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = "";
  let inCopyBlock = false;

  for await (const line of lines) {
    if (line.startsWith("COPY ")) {
      inCopyBlock = true;
      continue;
    }
    if (line === "\\.") {
      inCopyBlock = false;
      continue;
    }
    if (inCopyBlock) continue;

    if (line === STATEMENT_BREAKPOINT) {
      if (buffer.trim()) {
        yield buffer.trim();
        buffer = "";
      }
      continue;
    }

    buffer += line + "\n";
  }

  if (buffer.trim()) {
    yield buffer.trim();
  }

  stream.destroy();
  raw.destroy();
}

async function restore() {
  const sql = postgres("postgres://postgres@127.0.0.1:54329/postgres", {
    max: 1,
    connect_timeout: 30,
    onnotice: () => {},
  });

  try {
    await sql`SELECT 1`;
    console.log("Connected to database");

    let count = 0;
    let errors = 0;
    for await (const statement of readRestoreStatements(BACKUP_FILE)) {
      if (statement.includes("COPY ") || statement.includes("\\.")) continue;
      
      try {
        await sql.unsafe(statement).execute();
        count++;
      } catch (err: any) {
        // Ignore "already exists" and duplicate errors
        if (err.code === "42P07" || err.code === "42710" || err.code === "23505" || err.code === "42P06") {
          continue;
        }
        errors++;
        console.error(`Error (${err.code}): ${err.message.slice(0, 100)}`);
      }
    }

    console.log(`Restore completed. ${count} statements executed. ${errors} errors.`);
  } finally {
    await sql.end();
  }
}

restore().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
