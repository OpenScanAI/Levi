import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { findingsService, normalizeFindingsLimit } from "../services/findings.js";
import { assertCompanyAccess } from "./authz.js";

export function findingsRoutes(db: Db) {
  const router = Router();
  const svc = findingsService(db);

  // List findings with filters
  router.get("/companies/:companyId/findings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const query = req.query as Record<string, unknown>;
    const filters = {
      companyId,
      agentId: typeof query.agentId === "string" ? query.agentId : undefined,
      runId: typeof query.runId === "string" ? query.runId : undefined,
      severity: typeof query.severity === "string" ? query.severity as any : undefined,
      verified: query.verified === "true" ? true : query.verified === "false" ? false : undefined,
      category: typeof query.category === "string" ? query.category : undefined,
      dateFrom: typeof query.dateFrom === "string" ? new Date(query.dateFrom) : undefined,
      dateTo: typeof query.dateTo === "string" ? new Date(query.dateTo) : undefined,
      limit: normalizeFindingsLimit(Number(query.limit)),
      offset: Number(query.offset) > 0 ? Number(query.offset) : 0,
    };

    const result = await svc.list(filters);
    res.json(result);
  });

  // Get findings summary by severity
  router.get("/companies/:companyId/findings/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  // Create a finding
  router.post("/companies/:companyId/findings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const finding = await svc.create({
      companyId,
      agentId: typeof body.agentId === "string" ? body.agentId : "",
      runId: typeof body.runId === "string" ? body.runId : null,
      severity: (typeof body.severity === "string" ? body.severity : "info") as any,
      category: typeof body.category === "string" ? body.category : null,
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : null,
      cvssScore: typeof body.cvssScore === "number" ? body.cvssScore : null,
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : null,
    });

    res.status(201).json(finding);
  });

  // Get a single finding
  router.get("/companies/:companyId/findings/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const finding = await svc.getById(companyId, id);
    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }
    res.json(finding);
  });

  // Update a finding
  router.patch("/companies/:companyId/findings/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const finding = await svc.update(companyId, id, {
      severity: typeof body.severity === "string" ? body.severity as any : undefined,
      category: typeof body.category === "string" ? body.category : null,
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : null,
      cvssScore: typeof body.cvssScore === "number" ? body.cvssScore : null,
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : null,
    });

    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }
    res.json(finding);
  });

  // Verify a finding
  router.post("/companies/:companyId/findings/:id/verify", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const verifiedBy = typeof body.verifiedBy === "string" ? body.verifiedBy : req.actor?.userId ?? "system";

    const finding = await svc.verify(companyId, id, verifiedBy);
    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }
    res.json(finding);
  });

  // Delete a finding
  router.delete("/companies/:companyId/findings/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const finding = await svc.delete(companyId, id);
    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }
    res.json({ deleted: true });
  });

  return router;
}
