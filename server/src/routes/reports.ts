import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { reportsService } from "../services/reports.js";
import { assertCompanyAccess } from "./authz.js";
import type { StorageService } from "../storage/types.js";

export function reportsRoutes(db: Db, storageService: StorageService) {
  const router = Router();
  const svc = reportsService(db, storageService);

  // List reports
  router.get("/companies/:companyId/reports", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const query = req.query as Record<string, unknown>;
    const filters = {
      companyId,
      type: typeof query.type === "string" ? query.type as "custom" | "summary" | "eod" | "import" : undefined,
      limit: Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 50,
      offset: Number(query.offset) > 0 ? Number(query.offset) : 0,
    };

    const result = await svc.list(filters);
    res.json(result);
  });

  // Create a report
  router.post("/companies/:companyId/reports", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const report = await svc.create({
      companyId,
      type: (typeof body.type === "string" ? body.type : "summary") as "custom" | "summary" | "eod" | "import",
      title: typeof body.title === "string" ? body.title : "",
      contentJson: typeof body.contentJson === "object" && body.contentJson !== null ? body.contentJson as Record<string, unknown> : {},
      logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : null,
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : req.actor?.userId ?? "system",
    });

    res.status(201).json(report);
  });

  // Get a single report
  router.get("/companies/:companyId/reports/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const report = await svc.getById(companyId, id);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json(report);
  });

  // Delete a report
  router.delete("/companies/:companyId/reports/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const report = await svc.delete(companyId, id);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json({ deleted: true });
  });

  // Generate EOD PDF report
  router.post("/companies/:companyId/reports/eod", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const result = await svc.generateEodPdf({
      companyId,
      companyName: typeof body.companyName === "string" ? body.companyName : "",
      logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : null,
      date: typeof body.date === "string" ? body.date : new Date().toISOString().split("T")[0],
      totalRuns: Number(body.totalRuns) || 0,
      succeededRuns: Number(body.succeededRuns) || 0,
      failedRuns: Number(body.failedRuns) || 0,
      stuckRuns: Number(body.stuckRuns) || 0,
      findingsSummary: Array.isArray(body.findingsSummary) ? body.findingsSummary as Array<{ severity: string; count: number; verified: number }> : [],
      topAgents: Array.isArray(body.topAgents) ? body.topAgents as Array<{ name: string; runs: number; successRate: number }> : [],
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : req.actor?.userId ?? "system",
    });

    // Also create a report record
    const report = await svc.create({
      companyId,
      type: "eod",
      title: `End of Day Report — ${new Date().toISOString().split("T")[0]}`,
      pdfUrl: result.pdfUrl,
      logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : null,
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : req.actor?.userId ?? "system",
    });

    res.status(201).json({ report, pdfUrl: result.pdfUrl, pageCount: result.pageCount, byteSize: result.byteSize });
  });

  // Generate Import Summary PDF report
  router.post("/companies/:companyId/reports/import-summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const result = await svc.generateImportSummaryPdf({
      companyId,
      companyName: typeof body.companyName === "string" ? body.companyName : "",
      logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : null,
      date: typeof body.date === "string" ? body.date : new Date().toISOString().split("T")[0],
      importedAgents: Array.isArray(body.importedAgents) ? body.importedAgents as Array<{ name: string; source: string; status: string; skills: number; issues: number }> : [],
      totalImported: Number(body.totalImported) || 0,
      successfulImports: Number(body.successfulImports) || 0,
      failedImports: Number(body.failedImports) || 0,
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : req.actor?.userId ?? "system",
    });

    // Also create a report record
    const report = await svc.create({
      companyId,
      type: "import",
      title: `Agent Import Summary — ${new Date().toISOString().split("T")[0]}`,
      pdfUrl: result.pdfUrl,
      logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : null,
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : req.actor?.userId ?? "system",
    });

    res.status(201).json({ report, pdfUrl: result.pdfUrl, pageCount: result.pageCount, byteSize: result.byteSize });
  });

  // Download PDF
  router.get("/companies/:companyId/reports/:id/download", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const report = await svc.getById(companyId, id);
    if (!report || !report.pdfUrl) {
      res.status(404).json({ error: "Report or PDF not found" });
      return;
    }

    const fileResult = await storageService.getObject(companyId, report.pdfUrl);
    res.setHeader("Content-Type", fileResult.contentType ?? "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.title.replace(/[^a-z0-9]/gi, "_")}.pdf"`);
    fileResult.stream.pipe(res);
  });

  return router;
}
