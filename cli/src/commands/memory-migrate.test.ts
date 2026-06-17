import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryMigrateCommand, registerMemoryMigrateCommands } from "./memory-migrate.js";
import { Command } from "commander";

// Mock dependencies
vi.mock("@paperclipai/server", () => ({
  migrateHistoricalData: vi.fn(),
  createMemoryService: vi.fn(() => ({
    enabled: true,
    isHealthy: vi.fn().mockResolvedValue(true),
    store: vi.fn().mockResolvedValue({ id: "mem1" }),
    query: vi.fn().mockResolvedValue([]),
    purgeCompany: vi.fn().mockResolvedValue(undefined),
    purgeProject: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
  })),
}));

vi.mock("@paperclipai/db", () => ({
  applyPendingMigrations: vi.fn().mockResolvedValue(undefined),
  createDb: vi.fn(() => ({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    query: { routines: { findMany: vi.fn().mockResolvedValue([]) } },
    $client: { end: vi.fn().mockResolvedValue(undefined) },
  })),
  createEmbeddedPostgresLogBuffer: vi.fn(() => ({
    append: vi.fn(),
    getRecentLogs: vi.fn().mockReturnValue([]),
  })),
  ensurePostgresDatabase: vi.fn().mockResolvedValue(undefined),
  formatEmbeddedPostgresError: vi.fn((err) => err),
}));

vi.mock("../config/env.js", () => ({
  loadPaperclipEnvFile: vi.fn(),
}));

vi.mock("../config/store.js", () => ({
  readConfig: vi.fn(() => ({
    database: {
      mode: "postgres",
      connectionString: "postgres://localhost:5432/paperclip",
    },
  })),
  resolveConfigPath: vi.fn(() => "/mock/config.json"),
}));

vi.mock("../utils/banner.js", () => ({
  printPaperclipCliBanner: vi.fn(),
}));

const { migrateHistoricalData } = await import("@paperclipai/server");

describe("memoryMigrateCommand", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("migrates historical data successfully", async () => {
    vi.mocked(migrateHistoricalData).mockResolvedValue({
      migratedCount: 42,
      errors: [],
    });

    await memoryMigrateCommand({ company: "comp123", json: false });

    expect(migrateHistoricalData).toHaveBeenCalledWith(
      "comp123",
      expect.anything(),
      expect.anything(),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("42 memories migrated"),
    );
  });

  it("outputs JSON when --json is passed", async () => {
    vi.mocked(migrateHistoricalData).mockResolvedValue({
      migratedCount: 5,
      errors: ["Task task1: Some error"],
    });

    await memoryMigrateCommand({ company: "comp456", json: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('"migratedCount": 5'),
    );
  });

  it("logs errors when migration has partial failures", async () => {
    vi.mocked(migrateHistoricalData).mockResolvedValue({
      migratedCount: 10,
      errors: ["Task task1: Failed", "Comment c1: Failed"],
    });

    await memoryMigrateCommand({ company: "comp789", json: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 error(s) occurred"),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Task task1: Failed"),
    );
  });

  it("throws when company ID is missing", async () => {
    await expect(memoryMigrateCommand({ company: "" })).rejects.toThrow(
      "Company ID is required",
    );
  });

  it("throws when migration fails", async () => {
    vi.mocked(migrateHistoricalData).mockRejectedValue(new Error("DB connection failed"));

    await expect(memoryMigrateCommand({ company: "comp999" })).rejects.toThrow(
      "DB connection failed",
    );
  });
});

describe("registerMemoryMigrateCommands", () => {
  it("registers the memory migrate command", () => {
    const program = new Command();
    registerMemoryMigrateCommands(program);

    const memoryCmd = program.commands.find((cmd) => cmd.name() === "memory");
    expect(memoryCmd).toBeDefined();

    const migrateCmd = memoryCmd?.commands.find((cmd) => cmd.name() === "migrate");
    expect(migrateCmd).toBeDefined();
    expect(migrateCmd?.description()).toContain("Migrate historical data");
  });
});
