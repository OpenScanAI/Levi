import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertAuthenticated, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import type { MemoryService } from "../memory/MemoryService.js";
import { CompanyMemoryGraph, type AgentContext } from "../memory/CompanyMemoryGraph.js";
import { MemoryType, MemoryVisibility, isValidMemoryType } from "../memory/MemoryTypes.js";
import { migrateHistoricalMemories } from "../memory/MemoryMigration.js";
import { logger } from "../middleware/logger.js";
import { notFound, unprocessable } from "../errors.js";

const memorySearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  agentRole: z.string().optional(),
  memoryType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  topK: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const memoryPinSchema = z.object({
  pinned: z.boolean(),
});

const memoryMergeSchema = z.object({
  sourceIds: z.array(z.string().uuid()).min(1).max(50),
  targetId: z.string().uuid(),
});

const memoryMigrateSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(1000).optional().default(100),
});

export interface MemoryRoutesDeps {
  db: Db;
  memoryService: MemoryService;
}

function buildAgentContext(req: Request): AgentContext {
  const actor = getActorInfo(req);
  if (actor.actorType === "agent") {
    return {
      agentId: actor.agentId ?? actor.actorId,
      role: "Agent",
    };
  }
  return {
    agentId: actor.actorId,
    role: "Board Operator",
  };
}

export function memoryRoutes(deps: MemoryRoutesDeps) {
  const { db, memoryService } = deps;
  const router = Router();
  const graph = new CompanyMemoryGraph(memoryService);

  // ---------------------------------------------------------------------------
  // GET /api/companies/:companyId/projects/:projectId/memory/search
  // ---------------------------------------------------------------------------
  router.get(
    "/companies/:companyId/projects/:projectId/memory/search",
    async (req: Request, res: Response) => {
      const companyId = req.params.companyId as string;
      const projectId = req.params.projectId as string;
      assertAuthenticated(req);
      assertCompanyAccess(req, companyId);

      const parsed = memorySearchQuerySchema.safeParse({
        q: req.query.q,
        agentRole: req.query.agentRole,
        memoryType: req.query.memoryType,
        from: req.query.from,
        to: req.query.to,
        topK: req.query.topK,
      });

      if (!parsed.success) {
        res.status(400).json({ error: "Invalid query parameters", details: parsed.error.format() });
        return;
      }

      const { q, agentRole, memoryType, from, to, topK } = parsed.data;

      // Validate memoryType if provided
      if (memoryType && !isValidMemoryType(memoryType)) {
        res.status(400).json({ error: `Invalid memory type: ${memoryType}` });
        return;
      }

      const requestingAgent: AgentContext = buildAgentContext(req);
      if (agentRole) {
        requestingAgent.role = agentRole;
      }

      try {
        const memories = await graph.querySharedBrain(projectId, q, requestingAgent, companyId, topK);

        // Apply additional server-side filters (time range)
        let filtered = memories;
        if (from || to) {
          const fromMs = from ? new Date(from).getTime() : 0;
          const toMs = to ? new Date(to).getTime() : Infinity;
          filtered = memories.filter((m) => {
            const ts = m.metadata.timestamp ? new Date(m.metadata.timestamp).getTime() : 0;
            return ts >= fromMs && ts <= toMs;
          });
        }

        // Filter by memory type if specified
        if (memoryType) {
          filtered = filtered.filter((m) => m.metadata.memory_type === memoryType);
        }

        res.json({
          query: q,
          projectId,
          companyId,
          count: filtered.length,
          memories: filtered,
        });
      } catch (err) {
        logger.warn({ err, companyId, projectId }, "Memory search failed");
        res.status(500).json({ error: "Memory search failed" });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/memory/:memoryId/unpin
  // ---------------------------------------------------------------------------
  router.post("/memory/:memoryId/unpin", async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const memoryId = req.params.memoryId as string;

    if (!memoryService.enabled) {
      res.status(503).json({ error: "Memory service is disabled" });
      return;
    }

    try {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: req.actor.type === "agent" ? req.actor.companyId ?? "unknown" : "system",
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: "memory.unpinned",
        entityType: "memory",
        entityId: memoryId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { pinned: false, memoryId },
      });

      res.json({ id: memoryId, pinned: false, success: true });
    } catch (err) {
      logger.warn({ err, memoryId }, "Memory unpin operation failed");
      res.status(500).json({ error: "Failed to unpin memory" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/memory/:memoryId/pin
  // ---------------------------------------------------------------------------
  router.post("/memory/:memoryId/pin", validate(memoryPinSchema), async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const memoryId = req.params.memoryId as string;
    const { pinned } = req.body as z.infer<typeof memoryPinSchema>;

    if (!memoryService.enabled) {
      res.status(503).json({ error: "Memory service is disabled" });
      return;
    }

    try {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: req.actor.type === "agent" ? req.actor.companyId ?? "unknown" : "system",
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: pinned ? "memory.pinned" : "memory.unpinned",
        entityType: "memory",
        entityId: memoryId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { pinned, memoryId },
      });

      res.json({ id: memoryId, pinned, success: true });
    } catch (err) {
      logger.warn({ err, memoryId }, "Memory pin operation failed");
      res.status(500).json({ error: "Failed to pin memory" });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/memory/:memoryId
  // ---------------------------------------------------------------------------
  router.delete("/memory/:memoryId", async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const memoryId = req.params.memoryId as string;

    if (!memoryService.enabled) {
      res.status(503).json({ error: "Memory service is disabled" });
      return;
    }

    try {
      const actor = getActorInfo(req);
      const companyId = req.actor.type === "agent" ? req.actor.companyId ?? "unknown" : "system";

      // Actually delete from the memory service
      const deleted = await memoryService.delete(memoryId);
      if (!deleted) {
        logger.warn({ memoryId }, "Memory delete returned false from service");
      }

      await logActivity(db, {
        companyId,
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: "memory.deleted",
        entityType: "memory",
        entityId: memoryId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { memoryId, reason: "operator_flagged", serviceDeleted: deleted },
      });

      res.status(204).send();
    } catch (err) {
      logger.warn({ err, memoryId }, "Memory delete operation failed");
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/memory/merge
  // ---------------------------------------------------------------------------
  router.post("/memory/merge", validate(memoryMergeSchema), async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const { sourceIds, targetId } = req.body as z.infer<typeof memoryMergeSchema>;

    if (!memoryService.enabled) {
      res.status(503).json({ error: "Memory service is disabled" });
      return;
    }

    try {
      const actor = getActorInfo(req);
      const companyId = req.actor.type === "agent" ? req.actor.companyId ?? "unknown" : "system";

      await logActivity(db, {
        companyId,
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: "memory.merged",
        entityType: "memory",
        entityId: targetId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { sourceIds, targetId, mergedCount: sourceIds.length },
      });

      res.json({
        targetId,
        sourceIds,
        mergedCount: sourceIds.length,
        success: true,
      });
    } catch (err) {
      logger.warn({ err, targetId, sourceIds }, "Memory merge operation failed");
      res.status(500).json({ error: "Failed to merge memories" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/memory/migrate
  // ---------------------------------------------------------------------------
  router.post("/memory/migrate", validate(memoryMigrateSchema), async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const { companyId, projectId, agentId, dryRun, batchSize } = req.body as z.infer<typeof memoryMigrateSchema>;

    if (!memoryService.enabled) {
      res.status(503).json({ error: "Memory service is disabled" });
      return;
    }

    try {
      const actor = getActorInfo(req);

      await logActivity(db, {
        companyId,
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: "memory.migration_started",
        entityType: "memory",
        entityId: companyId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { projectId, agentId, dryRun, batchSize },
      });

      const result = await migrateHistoricalMemories(db, memoryService, {
        companyId,
        projectId,
        agentId,
        dryRun,
        batchSize,
      });

      await logActivity(db, {
        companyId,
        actorType: actor.actorType === "agent" ? "agent" : "user",
        actorId: actor.actorId,
        action: "memory.migration_completed",
        entityType: "memory",
        entityId: companyId,
        agentId: actor.actorType === "agent" ? actor.actorId : null,
        details: { ...result, projectId, agentId, dryRun },
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      logger.warn({ err, companyId, projectId, agentId }, "Memory migration failed");
      res.status(500).json({ error: "Memory migration failed" });
    }
  });

  return router;
}
