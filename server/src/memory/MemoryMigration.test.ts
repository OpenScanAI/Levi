import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateHistoricalMemories, hasMigrationBeenRun } from "./MemoryMigration.js";
import type { MemoryService } from "./MemoryService.js";
import type { Db } from "@paperclipai/db";

function createMockDb(): any {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    query: {
      activityLog: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      heartbeatRuns: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
  };
}

function createMockMemoryService(enabled = true): MemoryService {
  return {
    enabled,
    isHealthy: vi.fn(() => Promise.resolve(true)),
    store: vi.fn(() => Promise.resolve(null)),
    query: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(() => Promise.resolve(true)),
    purgeCompany: vi.fn(() => Promise.resolve()),
    purgeProject: vi.fn(() => Promise.resolve()),
    shutdown: vi.fn(),
  };
}

describe("migrateHistoricalMemories", () => {
  it("returns zeros when memory service is disabled", async () => {
    const db = createMockDb();
    const memoryService = createMockMemoryService(false);

    const result = await migrateHistoricalMemories(db, memoryService, {
      companyId: "comp-1",
    });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("counts items in dry-run mode without storing", async () => {
    const db = createMockDb();
    const memoryService = createMockMemoryService();

    db.query.activityLog.findMany = vi.fn(() =>
      Promise.resolve([
        {
          id: "log-1",
          company_id: "comp-1",
          project_id: "proj-1",
          agent_id: "agent-1",
          action: "decision.made",
          details: { choice: "option-a" },
          created_at: new Date(),
        },
      ]),
    );

    db.query.heartbeatRuns.findMany = vi.fn(() =>
      Promise.resolve([
        {
          id: "run-1",
          company_id: "comp-1",
          project_id: "proj-1",
          agent_id: "agent-1",
          status: "completed",
          result_summary: "Implemented feature X",
          stderr_excerpt: null,
          cost_cents: 100,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await migrateHistoricalMemories(db, memoryService, {
      companyId: "comp-1",
      dryRun: true,
    });

    expect(result.imported).toBe(2);
    expect(result.errors).toBe(0);
    expect(memoryService.store).not.toHaveBeenCalled();
  });

  it("stores memories from activity logs and runs", async () => {
    const db = createMockDb();
    const memoryService = createMockMemoryService();

    db.query.activityLog.findMany = vi.fn(() =>
      Promise.resolve([
        {
          id: "log-1",
          company_id: "comp-1",
          project_id: "proj-1",
          agent_id: "agent-1",
          action: "error.occurred",
          details: { message: "Something failed" },
          created_at: new Date(),
        },
      ]),
    );

    db.query.heartbeatRuns.findMany = vi.fn(() =>
      Promise.resolve([
        {
          id: "run-1",
          company_id: "comp-1",
          project_id: "proj-1",
          agent_id: "agent-1",
          status: "completed",
          result_summary: "Implemented feature X",
          stderr_excerpt: "stderr output",
          cost_cents: 100,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );

    const result = await migrateHistoricalMemories(db, memoryService, {
      companyId: "comp-1",
    });

    expect(result.imported).toBe(3); // 1 activity log + 1 decision + 1 error
    expect(result.errors).toBe(0);
    expect(memoryService.store).toHaveBeenCalledTimes(3);
  });

  it("filters by projectId and agentId", async () => {
    const db = createMockDb();
    const memoryService = createMockMemoryService();

    const activityFindMany = vi.fn(() => Promise.resolve([]));
    const runsFindMany = vi.fn(() => Promise.resolve([]));

    db.query.activityLog.findMany = activityFindMany;
    db.query.heartbeatRuns.findMany = runsFindMany;

    await migrateHistoricalMemories(db, memoryService, {
      companyId: "comp-1",
      projectId: "proj-1",
      agentId: "agent-1",
    });

    expect(activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Function),
        limit: 100,
      }),
    );
  });
});

describe("hasMigrationBeenRun", () => {
  it("returns false when no runs exist", async () => {
    const db = createMockDb();
    db.query.heartbeatRuns.findMany = vi.fn(() => Promise.resolve([]));

    const result = await hasMigrationBeenRun(db, "comp-1");
    expect(result).toBe(false);
  });

  it("returns true when runs exist", async () => {
    const db = createMockDb();
    db.query.heartbeatRuns.findMany = vi.fn(() =>
      Promise.resolve([{ id: "run-1" }]),
    );

    const result = await hasMigrationBeenRun(db, "comp-1");
    expect(result).toBe(true);
  });
});
