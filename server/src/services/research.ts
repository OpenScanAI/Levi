import { and, eq, sql, desc, count } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  researchSessions,
  researchTasks,
  researchFindings,
  researchSources,
  researchMemory,
} from "@paperclipai/db";
import { notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import type {
  CreateResearchSession,
  UpdateResearchSession,
  CreateResearchTask,
  UpdateResearchTask,
  CreateResearchFinding,
  CreateResearchMemory,
} from "@paperclipai/shared";
import { researchEngine } from "./research-engine.js";
import { generateResearchPlan } from "./research-llm.js";
import type { Config } from "../config.js";

export function researchService(db: Db, config?: Config) {
  const engine = config ? researchEngine({ db, config }) : null;

  return {
    // ──────────────────────────────────────────────────────────────────────────
    // Engine
    // ──────────────────────────────────────────────────────────────────────────

    startSession: async (companyId: string, sessionId: string) => {
      if (!engine) {
        throw new Error("Research engine is not configured");
      }
      if (!config?.researchEngineEnabled) {
        throw new Error("Research engine is disabled");
      }

      // Verify session exists and is in planning state
      const session = await db
        .select()
        .from(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!session) throw notFound("Research session not found");
      if (session.status !== "planning") {
        throw new Error(`Cannot start session from status: ${session.status}`);
      }

      // Start execution in background (do not await)
      void engine.executeSession(sessionId, companyId).catch((err) => {
        logger.error({ sessionId, err }, "Research engine execution error");
      });

      return { started: true, sessionId };
    },

    cancelSession: async (companyId: string, sessionId: string) => {
      if (!engine) {
        throw new Error("Research engine is not configured");
      }

      const cancelled = await engine.requestCancel(sessionId, companyId);
      return { cancelled, sessionId };
    },

    resumeSession: async (companyId: string, sessionId: string) => {
      if (!engine) {
        throw new Error("Research engine is not configured");
      }
      if (!config?.researchEngineEnabled) {
        throw new Error("Research engine is disabled");
      }

      // Verify session exists and is in cancelled or failed state
      const session = await db
        .select()
        .from(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!session) throw notFound("Research session not found");
      if (session.status !== "cancelled" && session.status !== "failed" && session.status !== "cancelling") {
        throw new Error(`Cannot resume session from status: ${session.status}`);
      }

      // Resume execution in background (do not await)
      void engine.resumeSession(sessionId, companyId).catch((err) => {
        logger.error({ sessionId, err }, "Research engine resume error");
      });

      return { resumed: true, sessionId };
    },

    retryTask: async (companyId: string, sessionId: string, taskId: string) => {
      if (!engine) {
        throw new Error("Research engine is not configured");
      }
      if (!config?.researchEngineEnabled) {
        throw new Error("Research engine is disabled");
      }

      // Verify session exists
      const session = await db
        .select()
        .from(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!session) throw notFound("Research session not found");

      // Retry task in background (do not await)
      void engine.retryTask(taskId, sessionId, companyId).catch((err) => {
        logger.error({ sessionId, taskId, err }, "Research engine retry task error");
      });

      return { retried: true, taskId, sessionId };
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Subtopic Generation
    // ──────────────────────────────────────────────────────────────────────────

    generateSubtopics: async (data: { query: string; depth?: string; maxSubtopics?: number }) => {
      const plan = await generateResearchPlan(
        data.query,
        data.maxSubtopics ?? 5,
        data.depth ?? "medium",
        { model: config?.researchLlmModel, apiKey: config?.researchLlmApiKey }
      );
      return plan;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Sessions
    // ──────────────────────────────────────────────────────────────────────────

    createSession: async (companyId: string, actorId: string, data: CreateResearchSession) => {
      const [session] = await db
        .insert(researchSessions)
        .values({
          companyId,
          title: data.title,
          query: data.query,
          depth: data.depth ?? "medium",
          maxSubtopics: data.maxSubtopics ?? 5,
          createdBy: actorId,
          plan: data.plan ? (data.plan as any) : null,
        })
        .returning();
      return session;
    },

    listSessions: async (companyId: string, opts?: { status?: string; limit?: number; offset?: number }) => {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const conditions = [eq(researchSessions.companyId, companyId)];
      if (opts?.status) {
        conditions.push(eq(researchSessions.status, opts.status as any));
      }

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(researchSessions)
          .where(and(...conditions))
          .orderBy(desc(researchSessions.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(researchSessions)
          .where(and(...conditions))
          .then((rows) => Number(rows[0]?.count ?? 0)),
      ]);

      return { items, total: totalResult, limit, offset };
    },

    getSession: async (companyId: string, sessionId: string) => {
      const session = await db
        .select()
        .from(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!session) throw notFound("Research session not found");

      const [tasks, findings, sources] = await Promise.all([
        db
          .select()
          .from(researchTasks)
          .where(eq(researchTasks.sessionId, sessionId))
          .orderBy(researchTasks.sequenceOrder),
        db
          .select()
          .from(researchFindings)
          .where(eq(researchFindings.sessionId, sessionId))
          .orderBy(desc(researchFindings.createdAt)),
        db
          .select()
          .from(researchSources)
          .where(eq(researchSources.sessionId, sessionId))
          .orderBy(desc(researchSources.accessCount)),
      ]);

      return { ...session, tasks, findings, sources };
    },

    updateSession: async (companyId: string, sessionId: string, data: UpdateResearchSession) => {
      // Fetch current session to check if we need to save original report
      const currentSession = await db
        .select()
        .from(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!currentSession) throw notFound("Research session not found");

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.title !== undefined) updateData.title = data.title;
      if (data.query !== undefined) updateData.query = data.query;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.depth !== undefined) updateData.depth = data.depth;
      if (data.maxSubtopics !== undefined) updateData.maxSubtopics = data.maxSubtopics;

      // Handle report editing
      if (data.report !== undefined) {
        // If this is the first edit, save the original report
        if (!currentSession.isEdited && currentSession.report && !currentSession.originalReport) {
          updateData.originalReport = currentSession.report;
        }
        updateData.report = data.report;
        updateData.isEdited = true;
      }

      const [updated] = await db
        .update(researchSessions)
        .set(updateData)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .returning();

      return updated;
    },

    deleteSession: async (companyId: string, sessionId: string) => {
      const [deleted] = await db
        .delete(researchSessions)
        .where(and(eq(researchSessions.id, sessionId), eq(researchSessions.companyId, companyId)))
        .returning();

      if (!deleted) throw notFound("Research session not found");
      return deleted;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Tasks
    // ──────────────────────────────────────────────────────────────────────────

    createTask: async (companyId: string, sessionId: string, data: CreateResearchTask) => {
      const [task] = await db
        .insert(researchTasks)
        .values({
          companyId,
          sessionId,
          title: data.title,
          sequenceOrder: data.sequenceOrder ?? 0,
        })
        .returning();
      return task;
    },

    listTasks: async (companyId: string, sessionId: string) => {
      return db
        .select()
        .from(researchTasks)
        .where(and(eq(researchTasks.sessionId, sessionId), eq(researchTasks.companyId, companyId)))
        .orderBy(researchTasks.sequenceOrder);
    },

    getTask: async (companyId: string, taskId: string) => {
      const task = await db
        .select()
        .from(researchTasks)
        .where(and(eq(researchTasks.id, taskId), eq(researchTasks.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!task) throw notFound("Research task not found");
      return task;
    },

    updateTask: async (companyId: string, taskId: string, data: UpdateResearchTask) => {
      const [updated] = await db
        .update(researchTasks)
        .set({
          ...(data.title !== undefined && { title: data.title }),
          ...(data.status !== undefined && { status: data.status as any }),
          ...(data.findingsSummary !== undefined && { findingsSummary: data.findingsSummary }),
          ...(data.sources !== undefined && { sources: data.sources }),
          ...(data.reliabilityScore !== undefined && { reliabilityScore: data.reliabilityScore }),
          updatedAt: new Date(),
        })
        .where(and(eq(researchTasks.id, taskId), eq(researchTasks.companyId, companyId)))
        .returning();

      if (!updated) throw notFound("Research task not found");
      return updated;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Findings
    // ──────────────────────────────────────────────────────────────────────────

    createFinding: async (companyId: string, data: CreateResearchFinding) => {
      const [finding] = await db
        .insert(researchFindings)
        .values({
          companyId,
          taskId: data.taskId,
          sessionId: (
            await db
              .select({ sessionId: researchTasks.sessionId })
              .from(researchTasks)
              .where(eq(researchTasks.id, data.taskId))
              .then((rows) => rows[0]?.sessionId)
          )!,
          content: data.content,
          sourceUrl: data.sourceUrl,
          sourceTitle: data.sourceTitle,
          sourceDomain: data.sourceDomain,
          confidence: data.confidence as any,
          reliabilityScore: data.reliabilityScore,
          category: data.category,
          metadata: data.metadata ?? {},
        })
        .returning();
      return finding;
    },

    listFindings: async (companyId: string, opts?: { sessionId?: string; taskId?: string; category?: string; limit?: number; offset?: number }) => {
      const limit = Math.min(opts?.limit ?? 50, 100);
      const offset = opts?.offset ?? 0;
      const conditions = [eq(researchFindings.companyId, companyId)];
      if (opts?.sessionId) conditions.push(eq(researchFindings.sessionId, opts.sessionId));
      if (opts?.taskId) conditions.push(eq(researchFindings.taskId, opts.taskId));
      if (opts?.category) conditions.push(eq(researchFindings.category, opts.category));

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(researchFindings)
          .where(and(...conditions))
          .orderBy(desc(researchFindings.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(researchFindings)
          .where(and(...conditions))
          .then((rows) => Number(rows[0]?.count ?? 0)),
      ]);

      return { items, total: totalResult, limit, offset };
    },

    markDuplicate: async (companyId: string, findingId: string, duplicateOfId: string) => {
      const [updated] = await db
        .update(researchFindings)
        .set({ isDuplicate: true, duplicateOfId })
        .where(and(eq(researchFindings.id, findingId), eq(researchFindings.companyId, companyId)))
        .returning();

      if (!updated) throw notFound("Research finding not found");
      return updated;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Sources
    // ──────────────────────────────────────────────────────────────────────────

    getSources: async (companyId: string, sessionId: string) => {
      return db
        .select()
        .from(researchSources)
        .where(and(eq(researchSources.sessionId, sessionId), eq(researchSources.companyId, companyId)))
        .orderBy(desc(researchSources.accessCount));
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Memory
    // ──────────────────────────────────────────────────────────────────────────

    getMemory: async (companyId: string, key?: string) => {
      if (key) {
        return db
          .select()
          .from(researchMemory)
          .where(and(eq(researchMemory.companyId, companyId), eq(researchMemory.key, key)))
          .then((rows) => rows[0] ?? null);
      }
      return db
        .select()
        .from(researchMemory)
        .where(eq(researchMemory.companyId, companyId))
        .orderBy(desc(researchMemory.updatedAt));
    },

    setMemory: async (companyId: string, data: CreateResearchMemory) => {
      const existing = await db
        .select()
        .from(researchMemory)
        .where(and(eq(researchMemory.companyId, companyId), eq(researchMemory.key, data.key)))
        .then((rows) => rows[0] ?? null);

      if (existing) {
        const [updated] = await db
          .update(researchMemory)
          .set({
            value: data.value as any,
            sessionId: data.sessionId ?? existing.sessionId,
            sourceFindingId: data.sourceFindingId ?? existing.sourceFindingId,
            updatedAt: new Date(),
          })
          .where(eq(researchMemory.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(researchMemory)
        .values({
          companyId,
          key: data.key,
          value: data.value as any,
          sessionId: data.sessionId,
          sourceFindingId: data.sourceFindingId,
        })
        .returning();
      return created;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Dashboard
    // ──────────────────────────────────────────────────────────────────────────

    getDashboard: async (companyId: string) => {
      const [sessionStats, taskStats, findingStats, sourceStats] = await Promise.all([
        db
          .select({ status: researchSessions.status, count: sql<number>`count(*)` })
          .from(researchSessions)
          .where(eq(researchSessions.companyId, companyId))
          .groupBy(researchSessions.status),
        db
          .select({ status: researchTasks.status, count: sql<number>`count(*)` })
          .from(researchTasks)
          .where(eq(researchTasks.companyId, companyId))
          .groupBy(researchTasks.status),
        db
          .select({
            total: sql<number>`count(*)`,
            duplicates: sql<number>`sum(case when ${researchFindings.isDuplicate} = true then 1 else 0 end)`,
            avgReliability: sql<number>`avg(${researchFindings.reliabilityScore})`,
          })
          .from(researchFindings)
          .where(eq(researchFindings.companyId, companyId)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(researchSources)
          .where(eq(researchSources.companyId, companyId))
          .then((rows) => Number(rows[0]?.count ?? 0)),
      ]);

      const sessionCounts: Record<string, number> = {};
      for (const row of sessionStats) {
        sessionCounts[row.status] = Number(row.count);
      }

      const taskCounts: Record<string, number> = {};
      for (const row of taskStats) {
        taskCounts[row.status] = Number(row.count);
      }

      return {
        sessions: {
          total: Object.values(sessionCounts).reduce((a, b) => a + b, 0),
          byStatus: sessionCounts,
        },
        tasks: {
          total: Object.values(taskCounts).reduce((a, b) => a + b, 0),
          byStatus: taskCounts,
        },
        findings: {
          total: Number(findingStats[0]?.total ?? 0),
          duplicates: Number(findingStats[0]?.duplicates ?? 0),
          avgReliability: findingStats[0]?.avgReliability
            ? Number(Number(findingStats[0].avgReliability).toFixed(2))
            : null,
        },
        sources: {
          total: sourceStats,
        },
      };
    },
  };
}
