import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgentRunsService = vi.hoisted(() => ({
  listRuns: vi.fn(),
  getRunStats: vi.fn(),
  getRunById: vi.fn(),
  getRunTags: vi.fn(),
  addRunTag: vi.fn(),
  removeRunTag: vi.fn(),
}));

vi.mock("../services/agent-runs.js", () => ({
  agentRunsService: () => mockAgentRunsService,
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: vi.fn(),
}));

async function createApp() {
  const { agentRunsRoutes } = await import("../routes/agent-runs.js");
  const app = express();
  app.use(express.json());
  app.use(agentRunsRoutes({} as any));
  return app;
}

describe("agentRunsRoutes", () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("GET /companies/:companyId/runs", () => {
    it("returns paginated runs", async () => {
      mockAgentRunsService.listRuns.mockResolvedValue({
        runs: [{ id: "r1", companyId: "c1", status: "succeeded" }],
        total: 1,
        limit: 100,
        offset: 0,
      });

      const res = await request(app)
        .get("/companies/c1/runs")
        .query({ limit: "10", offset: "0" });

      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(1);
      expect(mockAgentRunsService.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "c1" })
      );
    });

    it("filters by status", async () => {
      mockAgentRunsService.listRuns.mockResolvedValue({
        runs: [],
        total: 0,
        limit: 100,
        offset: 0,
      });

      const res = await request(app)
        .get("/companies/c1/runs")
        .query({ status: "failed" });

      expect(res.status).toBe(200);
      expect(mockAgentRunsService.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" })
      );
    });
  });

  describe("GET /companies/:companyId/runs/stats", () => {
    it("returns run statistics", async () => {
      mockAgentRunsService.getRunStats.mockResolvedValue({
        total: 100,
        succeeded: 80,
        failed: 15,
        stuck: 5,
        successRate: 80,
      });

      const res = await request(app).get("/companies/c1/runs/stats");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(100);
      expect(res.body.successRate).toBe(80);
      expect(mockAgentRunsService.getRunStats).toHaveBeenCalledWith("c1");
    });
  });

  describe("GET /companies/:companyId/runs/:id", () => {
    it("returns a run by id", async () => {
      const run = { id: "r1", companyId: "c1", status: "succeeded" };
      mockAgentRunsService.getRunById.mockResolvedValue(run);

      const res = await request(app).get("/companies/c1/runs/r1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(run);
    });

    it("returns 404 for missing run", async () => {
      mockAgentRunsService.getRunById.mockResolvedValue(null);

      const res = await request(app).get("/companies/c1/runs/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Run not found");
    });
  });

  describe("GET /companies/:companyId/runs/:id/tags", () => {
    it("returns run tags", async () => {
      mockAgentRunsService.getRunTags.mockResolvedValue([
        { id: "t1", runId: "r1", tag: "production" },
      ]);

      const res = await request(app).get("/companies/c1/runs/r1/tags");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockAgentRunsService.getRunTags).toHaveBeenCalledWith("c1", "r1");
    });
  });

  describe("POST /companies/:companyId/runs/:id/tags", () => {
    it("adds a tag to a run", async () => {
      const tag = { id: "t1", runId: "r1", tag: "production" };
      mockAgentRunsService.addRunTag.mockResolvedValue(tag);

      const res = await request(app)
        .post("/companies/c1/runs/r1/tags")
        .send({ tag: "production" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(tag);
      expect(mockAgentRunsService.addRunTag).toHaveBeenCalledWith("c1", "r1", "production");
    });
  });

  describe("DELETE /companies/:companyId/runs/:id/tags/:tagId", () => {
    it("removes a tag from a run", async () => {
      mockAgentRunsService.removeRunTag.mockResolvedValue({ id: "t1" });

      const res = await request(app).delete("/companies/c1/runs/r1/tags/t1");

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("returns 404 for missing tag", async () => {
      mockAgentRunsService.removeRunTag.mockResolvedValue(null);

      const res = await request(app).delete("/companies/c1/runs/r1/tags/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Tag not found");
    });
  });
});
