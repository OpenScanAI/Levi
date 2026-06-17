import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { memoryRoutes } from "./memory.js";
import type { MemoryService } from "../memory/MemoryService.js";
import { MemoryType, MemoryVisibility } from "../memory/MemoryTypes.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function createMockDb(): any {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ id: "settings-1" }])),
      })),
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

// ─── Auth middleware mock ────────────────────────────────────────────────────

function mockAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.actor = {
    type: "board",
    userId: "user-1",
    userName: "Test User",
    userEmail: "test@example.com",
    companyId: "comp-1",
    companyIds: ["comp-1"],
    isInstanceAdmin: true,
    source: "local_implicit",
  };
  next();
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("memoryRoutes integration", () => {
  let app: express.Application;
  let db: any;
  let memoryService: MemoryService;

  beforeEach(() => {
    db = createMockDb();
    memoryService = createMockMemoryService();
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use("/api", memoryRoutes({ db, memoryService }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Search endpoint ───────────────────────────────────────────────────────

  describe("GET /api/companies/:companyId/projects/:projectId/memory/search", () => {
    it("returns empty results when no memories match", async () => {
      memoryService.query = vi.fn(() => Promise.resolve([]));

      const res = await request(app)
        .get("/api/companies/comp-1/projects/proj-1/memory/search?q=nomatch")
        .expect(200);

      expect(res.body).toMatchObject({
        query: "nomatch",
        projectId: "proj-1",
        companyId: "comp-1",
        count: 0,
        memories: [],
      });
    });

    it("returns matching memories with query", async () => {
      memoryService.query = vi.fn(() =>
        Promise.resolve([
          {
            id: "mem-1",
            content: "Implemented JWT authentication",
            metadata: {
              company_id: "comp-1",
              project_id: "proj-1",
              agent_id: "agent-1",
              task_id: "task-1",
              goal_ancestry: [],
              agent_role: "Backend Engineer",
              timestamp: new Date().toISOString(),
              run_id: "run-1",
              cost: 0.05,
              memory_type: MemoryType.Decision,
              visibility: MemoryVisibility.Shared,
            },
            namespace: "levi:comp-1:proj-1:agent-1",
            confidence: 0.95,
          },
        ]),
      );

      const res = await request(app)
        .get("/api/companies/comp-1/projects/proj-1/memory/search?q=JWT")
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.memories[0].content).toContain("JWT");
    });

    it("filters by memory type", async () => {
      memoryService.query = vi.fn(() =>
        Promise.resolve([
          {
            id: "mem-2",
            content: "Fixed null pointer exception",
            metadata: {
              company_id: "comp-1",
              project_id: "proj-1",
              agent_id: "agent-1",
              task_id: "task-2",
              goal_ancestry: [],
              agent_role: "Backend Engineer",
              timestamp: new Date().toISOString(),
              run_id: "run-2",
              cost: 0,
              memory_type: MemoryType.Error,
              visibility: MemoryVisibility.Shared,
            },
            namespace: "levi:comp-1:proj-1:agent-1",
            confidence: 0.88,
          },
        ]),
      );

      const res = await request(app)
        .get("/api/companies/comp-1/projects/proj-1/memory/search?q=fix&memoryType=error")
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.memories[0].metadata.memory_type).toBe("error");
    });

    it("returns 400 for invalid query params", async () => {
      const res = await request(app)
        .get("/api/companies/comp-1/projects/proj-1/memory/search")
        .expect(400);

      expect(res.body.error).toBe("Invalid query parameters");
    });

    it("returns 400 for invalid memory type", async () => {
      const res = await request(app)
        .get("/api/companies/comp-1/projects/proj-1/memory/search?q=test&memoryType=invalid_type")
        .expect(400);

      expect(res.body.error).toContain("Invalid memory type");
    });
  });

  // ── Unpin endpoint ────────────────────────────────────────────────────────

  describe("POST /api/memory/:memoryId/unpin", () => {
    it("unpins a memory successfully", async () => {
      const res = await request(app)
        .post("/api/memory/mem-123/unpin")
        .expect(200);

      expect(res.body).toMatchObject({
        id: "mem-123",
        pinned: false,
        success: true,
      });
    });

    it("returns 503 when memory service is disabled", async () => {
      memoryService = createMockMemoryService(false);
      app = express();
      app.use(express.json());
      app.use(mockAuthMiddleware);
      app.use("/api", memoryRoutes({ db, memoryService }));

      const res = await request(app)
        .post("/api/memory/mem-123/unpin")
        .expect(503);

      expect(res.body.error).toBe("Memory service is disabled");
    });
  });

  // ── Pin endpoint ──────────────────────────────────────────────────────────

  describe("POST /api/memory/:memoryId/pin", () => {
    it("pins a memory successfully", async () => {
      const res = await request(app)
        .post("/api/memory/mem-123/pin")
        .send({ pinned: true })
        .expect(200);

      expect(res.body).toMatchObject({
        id: "mem-123",
        pinned: true,
        success: true,
      });
    });

    it("unpins a memory successfully", async () => {
      const res = await request(app)
        .post("/api/memory/mem-123/pin")
        .send({ pinned: false })
        .expect(200);

      expect(res.body).toMatchObject({
        id: "mem-123",
        pinned: false,
        success: true,
      });
    });

    it("returns 503 when memory service is disabled", async () => {
      memoryService = createMockMemoryService(false);
      app = express();
      app.use(express.json());
      app.use(mockAuthMiddleware);
      app.use("/api", memoryRoutes({ db, memoryService }));

      const res = await request(app)
        .post("/api/memory/mem-123/pin")
        .send({ pinned: true })
        .expect(503);

      expect(res.body.error).toBe("Memory service is disabled");
    });
  });

  // ── Delete endpoint ───────────────────────────────────────────────────────

  describe("DELETE /api/memory/:memoryId", () => {
    it("deletes a memory successfully", async () => {
      await request(app)
        .delete("/api/memory/mem-123")
        .expect(204);

      expect(memoryService.delete).toHaveBeenCalledWith("mem-123");
    });

    it("returns 503 when memory service is disabled", async () => {
      memoryService = createMockMemoryService(false);
      app = express();
      app.use(express.json());
      app.use(mockAuthMiddleware);
      app.use("/api", memoryRoutes({ db, memoryService }));

      const res = await request(app)
        .delete("/api/memory/mem-123")
        .expect(503);

      expect(res.body.error).toBe("Memory service is disabled");
    });
  });

  // ── Migrate endpoint ──────────────────────────────────────────────────────

  describe("POST /api/memory/migrate", () => {
    it("runs migration in dry-run mode", async () => {
      const res = await request(app)
        .post("/api/memory/migrate")
        .send({
          companyId: "comp-1",
          dryRun: true,
          batchSize: 50,
        })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        imported: expect.any(Number),
        skipped: expect.any(Number),
        errors: expect.any(Number),
        durationMs: expect.any(Number),
      });
    });

    it("runs migration with project and agent filters", async () => {
      const res = await request(app)
        .post("/api/memory/migrate")
        .send({
          companyId: "comp-1",
          projectId: "proj-1",
          agentId: "agent-1",
          dryRun: true,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("returns 503 when memory service is disabled", async () => {
      memoryService = createMockMemoryService(false);
      app = express();
      app.use(express.json());
      app.use(mockAuthMiddleware);
      app.use("/api", memoryRoutes({ db, memoryService }));

      const res = await request(app)
        .post("/api/memory/migrate")
        .send({
          companyId: "comp-1",
          dryRun: true,
        })
        .expect(503);

      expect(res.body.error).toBe("Memory service is disabled");
    });
  });
});
