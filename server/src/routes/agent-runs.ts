import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentRunsService } from "../services/agent-runs.js";
import { assertCompanyAccess } from "./authz.js";

export function agentRunsRoutes(db: Db) {
  const router = Router();
  const svc = agentRunsService(db);

  // List runs with filters
  router.get("/companies/:companyId/runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const query = req.query as Record<string, unknown>;
    const filters = {
      companyId,
      agentId: typeof query.agentId === "string" ? query.agentId : undefined,
      status: typeof query.status === "string" ? query.status as "cancelled" | "queued" | "running" | "failed" | "timed_out" | "scheduled_retry" | "succeeded" : undefined,
      dateFrom: typeof query.dateFrom === "string" ? new Date(query.dateFrom) : undefined,
      dateTo: typeof query.dateTo === "string" ? new Date(query.dateTo) : undefined,
      tags: typeof query.tags === "string" ? query.tags.split(",") : undefined,
      limit: Number(query.limit) > 0 ? Math.min(Number(query.limit), 500) : 100,
      offset: Number(query.offset) > 0 ? Number(query.offset) : 0,
    };

    const result = await svc.listRuns(filters);
    res.json(result);
  });

  // Get run stats
  router.get("/companies/:companyId/runs/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const stats = await svc.getRunStats(companyId);
    res.json(stats);
  });

  // Get a single run
  router.get("/companies/:companyId/runs/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const run = await svc.getRunById(companyId, id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  });

  // Get run tags
  router.get("/companies/:companyId/runs/:id/tags", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const tags = await svc.getRunTags(companyId, id);
    res.json(tags);
  });

  // Add tag to run
  router.post("/companies/:companyId/runs/:id/tags", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const tag = await svc.addRunTag(companyId, id, typeof body.tag === "string" ? body.tag : "");
    res.status(201).json(tag);
  });

  // Remove tag from run
  router.delete("/companies/:companyId/runs/:id/tags/:tagId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    const tagId = req.params.tagId as string;
    assertCompanyAccess(req, companyId);

    const tag = await svc.removeRunTag(companyId, id, tagId);
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    res.json({ deleted: true });
  });

  return router;
}
