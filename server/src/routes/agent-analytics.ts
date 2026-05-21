 import { Router } from "express";
import type { Db } from "@paperclipai/db";

import { agentAnalyticsService } from "../services/agent-analytics.js";
import { assertCompanyAccess } from "./authz.js";

export function agentAnalyticsRoutes(db: Db) {
  const router = Router();

  const svc = agentAnalyticsService(db);

  router.get(
    "/companies/:companyId/analytics/agents",
    async (req, res) => {
      const companyId = req.params.companyId as string;

      assertCompanyAccess(req, companyId);

      const result = await svc.summary(companyId);

      res.json(result);
    },
  );

  return router;
}
