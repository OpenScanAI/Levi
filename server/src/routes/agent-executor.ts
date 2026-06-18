import { Router } from "express";
import { logger } from "../middleware/logger.js";

export function agentExecutorRoutes(): Router {
  const router = Router();

  // Mock agent executor that returns success for any request
  router.post("/", async (req, res) => {
    const { agentId, runId, context } = req.body;
    
    logger.info({ agentId, runId, context }, "Mock agent executor invoked");

    // Return a successful execution result
    res.json({
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: `Mock execution completed for agent ${agentId}`,
      output: "Task completed successfully (mock executor)",
      artifacts: [],
    });
  });

  // Health check endpoint
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: "mock" });
  });

  return router;
}
