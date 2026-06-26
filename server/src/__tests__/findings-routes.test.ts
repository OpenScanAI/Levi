import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindingsService = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  create: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  verify: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../services/findings.js", () => ({
  findingsService: () => mockFindingsService,
  normalizeFindingsLimit: (n: number) => Math.min(n || 100, 500),
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: vi.fn(),
}));

async function createApp() {
  const { findingsRoutes } = await import("../routes/findings.js");
  const app = express();
  app.use(express.json());
  app.use(findingsRoutes({} as any));
  return app;
}

describe("findingsRoutes", () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("GET /companies/:companyId/findings", () => {
    it("returns paginated findings", async () => {
      mockFindingsService.list.mockResolvedValue({
        findings: [{ id: "f1", title: "Test" }],
        total: 1,
        limit: 100,
        offset: 0,
      });

      const res = await request(app)
        .get("/companies/c1/findings")
        .query({ limit: "10", offset: "0" });

      if (res.status !== 200) {
        console.log("Status:", res.status);
        console.log("Body:", JSON.stringify(res.body, null, 2));
        console.log("Text:", res.text);
      }

      expect(res.status).toBe(200);
      expect(res.body.findings).toHaveLength(1);
      expect(mockFindingsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "c1" })
      );
    });

    it("filters by severity", async () => {
      mockFindingsService.list.mockResolvedValue({
        findings: [],
        total: 0,
        limit: 100,
        offset: 0,
      });

      const res = await request(app)
        .get("/companies/c1/findings")
        .query({ severity: "high" });

      expect(res.status).toBe(200);
      expect(mockFindingsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "high" })
      );
    });
  });

  describe("GET /companies/:companyId/findings/summary", () => {
    it("returns severity summary", async () => {
      mockFindingsService.summary.mockResolvedValue([
        { severity: "high", count: 5, verified: 3, unverified: 2 },
      ]);

      const res = await request(app).get("/companies/c1/findings/summary");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { severity: "high", count: 5, verified: 3, unverified: 2 },
      ]);
    });
  });

  describe("POST /companies/:companyId/findings", () => {
    it("creates a finding", async () => {
      const newFinding = {
        id: "f1",
        companyId: "c1",
        agentId: "a1",
        severity: "high",
        title: "Security Issue",
      };
      mockFindingsService.create.mockResolvedValue(newFinding);

      const res = await request(app)
        .post("/companies/c1/findings")
        .send({
          agentId: "a1",
          severity: "high",
          title: "Security Issue",
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newFinding);
      expect(mockFindingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "c1",
          agentId: "a1",
          severity: "high",
          title: "Security Issue",
        })
      );
    });
  });

  describe("GET /companies/:companyId/findings/:id", () => {
    it("returns a finding by id", async () => {
      const finding = { id: "f1", companyId: "c1", title: "Test" };
      mockFindingsService.getById.mockResolvedValue(finding);

      const res = await request(app).get("/companies/c1/findings/f1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(finding);
    });

    it("returns 404 for missing finding", async () => {
      mockFindingsService.getById.mockResolvedValue(null);

      const res = await request(app).get("/companies/c1/findings/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Finding not found");
    });
  });

  describe("PATCH /companies/:companyId/findings/:id", () => {
    it("updates a finding", async () => {
      const updated = { id: "f1", companyId: "c1", title: "Updated" };
      mockFindingsService.update.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/companies/c1/findings/f1")
        .send({ title: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
    });

    it("returns 404 for missing finding", async () => {
      mockFindingsService.update.mockResolvedValue(null);

      const res = await request(app)
        .patch("/companies/c1/findings/missing")
        .send({ title: "Updated" });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /companies/:companyId/findings/:id/verify", () => {
    it("verifies a finding", async () => {
      const verified = { id: "f1", verified: true };
      mockFindingsService.verify.mockResolvedValue(verified);

      const res = await request(app)
        .post("/companies/c1/findings/f1/verify")
        .send({ verifiedBy: "user1" });

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
    });
  });

  describe("DELETE /companies/:companyId/findings/:id", () => {
    it("deletes a finding", async () => {
      mockFindingsService.delete.mockResolvedValue({ id: "f1" });

      const res = await request(app).delete("/companies/c1/findings/f1");

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });
  });
});