import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReportsService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  getById: vi.fn(),
  delete: vi.fn(),
  generateEodPdf: vi.fn(),
  generateImportSummaryPdf: vi.fn(),
}));

const mockStorageService = vi.hoisted(() => ({
  getObject: vi.fn(),
}));

vi.mock("../services/reports.js", () => ({
  reportsService: () => mockReportsService,
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: vi.fn(),
}));

async function createApp() {
  const { reportsRoutes } = await import("../routes/reports.js");
  const app = express();
  app.use(express.json());
  app.use(reportsRoutes({} as any, mockStorageService as any));
  return app;
}

describe("reportsRoutes", () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("GET /companies/:companyId/reports", () => {
    it("returns paginated reports", async () => {
      mockReportsService.list.mockResolvedValue([
        { id: "r1", companyId: "c1", type: "eod", title: "EOD Report" },
      ]);

      const res = await request(app)
        .get("/companies/c1/reports")
        .query({ limit: "10", offset: "0" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockReportsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "c1" })
      );
    });

    it("filters by type", async () => {
      mockReportsService.list.mockResolvedValue([]);

      const res = await request(app)
        .get("/companies/c1/reports")
        .query({ type: "eod" });

      expect(res.status).toBe(200);
      expect(mockReportsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ type: "eod" })
      );
    });
  });

  describe("POST /companies/:companyId/reports", () => {
    it("creates a report", async () => {
      const newReport = {
        id: "r1",
        companyId: "c1",
        type: "summary",
        title: "Test Report",
      };
      mockReportsService.create.mockResolvedValue(newReport);

      const res = await request(app)
        .post("/companies/c1/reports")
        .send({
          type: "summary",
          title: "Test Report",
          contentJson: { data: "test" },
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newReport);
      expect(mockReportsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "c1",
          type: "summary",
          title: "Test Report",
        })
      );
    });
  });

  describe("GET /companies/:companyId/reports/:id", () => {
    it("returns a report by id", async () => {
      const report = { id: "r1", companyId: "c1", type: "eod" };
      mockReportsService.getById.mockResolvedValue(report);

      const res = await request(app).get("/companies/c1/reports/r1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
    });

    it("returns 404 for missing report", async () => {
      mockReportsService.getById.mockResolvedValue(null);

      const res = await request(app).get("/companies/c1/reports/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Report not found");
    });
  });

  describe("DELETE /companies/:companyId/reports/:id", () => {
    it("deletes a report", async () => {
      mockReportsService.delete.mockResolvedValue({ id: "r1" });

      const res = await request(app).delete("/companies/c1/reports/r1");

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("returns 404 for missing report", async () => {
      mockReportsService.delete.mockResolvedValue(null);

      const res = await request(app).delete("/companies/c1/reports/missing");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /companies/:companyId/reports/eod", () => {
    it("generates EOD PDF and creates report", async () => {
      mockReportsService.generateEodPdf.mockResolvedValue({
        pdfUrl: "reports/eod-123.pdf",
        pageCount: 2,
        byteSize: 1024,
      });
      mockReportsService.create.mockResolvedValue({
        id: "r1",
        companyId: "c1",
        type: "eod",
        title: "End of Day Report",
      });

      const res = await request(app)
        .post("/companies/c1/reports/eod")
        .send({
          companyName: "Test Co",
          date: "2024-01-01",
          totalRuns: 10,
          succeededRuns: 8,
          failedRuns: 1,
          stuckRuns: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.pdfUrl).toBe("reports/eod-123.pdf");
      expect(res.body.report).toBeDefined();
    });
  });

  describe("POST /companies/:companyId/reports/import-summary", () => {
    it("generates import summary PDF and creates report", async () => {
      mockReportsService.generateImportSummaryPdf.mockResolvedValue({
        pdfUrl: "reports/import-123.pdf",
        pageCount: 1,
        byteSize: 512,
      });
      mockReportsService.create.mockResolvedValue({
        id: "r2",
        companyId: "c1",
        type: "import",
        title: "Agent Import Summary",
      });

      const res = await request(app)
        .post("/companies/c1/reports/import-summary")
        .send({
          companyName: "Test Co",
          totalImported: 5,
          successfulImports: 4,
          failedImports: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.pdfUrl).toBe("reports/import-123.pdf");
      expect(res.body.report).toBeDefined();
    });
  });
});
