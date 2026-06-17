import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "express";
import { memoryRoutes } from "./memory.js";
import type { MemoryService } from "../memory/MemoryService.js";
import type { Db } from "@paperclipai/db";

function createMockDb(): Db {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    query: {
      activityLogs: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      runs: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      agentMemories: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
  } as unknown as Db;
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

describe("memoryRoutes", () => {
  it("returns an Express Router", () => {
    const db = createMockDb();
    const memoryService = createMockMemoryService();
    const router = memoryRoutes({ db, memoryService });
    expect(router).toBeInstanceOf(Router);
  });
});
