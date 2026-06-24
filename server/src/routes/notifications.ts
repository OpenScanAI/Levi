import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { notificationsService } from "../services/notifications.js";
import { assertCompanyAccess } from "./authz.js";

export function notificationsRoutes(db: Db) {
  const router = Router();
  const svc = notificationsService(db);

  // List notification configs
  router.get("/companies/:companyId/notifications/config", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const configs = await svc.listConfigs(companyId);
    res.json(configs);
  });

  // Create notification config
  router.post("/companies/:companyId/notifications/config", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const config = await svc.createConfig({
      companyId,
      type: (typeof body.type === "string" ? body.type : "webhook") as any,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : "",
      events: Array.isArray(body.events) ? body.events as ("agent.run.failed" | "agent.run.completed" | "agent.run.stuck" | "agent.finding.created" | "agent.report.generated" | "daily.digest")[] : [],
      enabled: body.enabled === true ? true : false,
    });

    res.status(201).json(config);
  });

  // Get a single notification config
  router.get("/companies/:companyId/notifications/config/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const config = await svc.getConfig(companyId, id);
    if (!config) {
      res.status(404).json({ error: "Notification config not found" });
      return;
    }
    res.json(config);
  });

  // Update notification config
  router.patch("/companies/:companyId/notifications/config/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const body = req.body as Record<string, unknown>;
    const config = await svc.updateConfig(companyId, id, {
      type: typeof body.type === "string" ? body.type as any : undefined,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : undefined,
      events: Array.isArray(body.events) ? body.events as ("agent.run.failed" | "agent.run.completed" | "agent.run.stuck" | "agent.finding.created" | "agent.report.generated" | "daily.digest")[] : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });

    if (!config) {
      res.status(404).json({ error: "Notification config not found" });
      return;
    }
    res.json(config);
  });

  // Delete notification config
  router.delete("/companies/:companyId/notifications/config/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const config = await svc.deleteConfig(companyId, id);
    if (!config) {
      res.status(404).json({ error: "Notification config not found" });
      return;
    }
    res.json({ deleted: true });
  });

  // Send test notification
  router.post("/companies/:companyId/notifications/config/:id/test", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.sendTestNotification(id, companyId);
    res.json(result);
  });

  return router;
}
