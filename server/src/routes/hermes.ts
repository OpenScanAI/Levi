/**
 * Hermes Proxy Route — Two Friends Model
 *
 * Exposes Hermes execution through Paperclip's Express server on port 3100.
 * The CTO agent calls POST /api/hermes/execute → Paperclip proxies to
 * the Hermes Python API server running on localhost:8080.
 */

import { Router, type Request, type Response } from "express";

export function hermesRoutes() {
  const router = Router();

  const HERMES_API_URL = process.env.HERMES_INTERNAL_URL || "http://127.0.0.1:8080";
  const HERMES_API_KEY = process.env.HERMES_API_KEY || "";

  router.post("/hermes/execute", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body || !body.task) {
        return res.status(400).json({ error: "Field 'task' is required" });
      }

      const response = await fetch(`${HERMES_API_URL}/api/v1/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HERMES_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err: any) {
      console.error("Hermes proxy error:", err);
      return res.status(502).json({
        error: "Hermes unavailable",
        detail: err?.message || String(err),
      });
    }
  });

  router.get("/hermes/health", async (_req: Request, res: Response) => {
    try {
      const response = await fetch(`${HERMES_API_URL}/api/v1/health`, {
        method: "GET",
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err: any) {
      return res.status(502).json({
        error: "Hermes unavailable",
        detail: err?.message || String(err),
      });
    }
  });

  return router;
}
