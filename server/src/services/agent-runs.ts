import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentRunTags, agents, heartbeatRuns } from "@paperclipai/db";
import type { HeartbeatRunStatus } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

/**
 * Filters for querying agent runs.
 */
export interface RunFilters {
  companyId: string;
  agentId?: string;
  status?: HeartbeatRunStatus;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
}

const DEFAULT_RUNS_LIMIT = 100;
const MAX_RUNS_LIMIT = 500;

/**
 * Clamp runs query limit to valid range.
 */
export function normalizeRunsLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_RUNS_LIMIT;
  return Math.max(1, Math.min(MAX_RUNS_LIMIT, Math.floor(limit ?? DEFAULT_RUNS_LIMIT)));
}

/**
 * Service for querying agent run history, statistics, and tags.
 */
export function agentRunsService(db: Db) {
  return {
    listRuns: async (filters: RunFilters) => {
      const limit = normalizeRunsLimit(filters.limit);
      const offset = Math.max(0, filters.offset ?? 0);

      const conditions = [eq(heartbeatRuns.companyId, filters.companyId)];
      if (filters.agentId) conditions.push(eq(heartbeatRuns.agentId, filters.agentId));
      if (filters.status) conditions.push(eq(heartbeatRuns.status, filters.status));
      if (filters.dateFrom) conditions.push(gte(heartbeatRuns.createdAt, filters.dateFrom));
      if (filters.dateTo) conditions.push(lte(heartbeatRuns.createdAt, filters.dateTo));

      let query = db
        .select({
          id: heartbeatRuns.id,
          companyId: heartbeatRuns.companyId,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          invocationSource: heartbeatRuns.invocationSource,
          triggerDetail: heartbeatRuns.triggerDetail,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          error: heartbeatRuns.error,
          exitCode: heartbeatRuns.exitCode,
          usageJson: heartbeatRuns.usageJson,
          resultJson: heartbeatRuns.resultJson,
          createdAt: heartbeatRuns.createdAt,
          updatedAt: heartbeatRuns.updatedAt,
        })
        .from(heartbeatRuns)
        .where(and(...conditions))
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(limit)
        .offset(offset);

      const rows = await query;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(heartbeatRuns)
        .where(and(...conditions));

      return {
        runs: rows,
        total: Number(count),
        limit,
        offset,
      };
    },

    getRunById: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.id, id)))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    getRunTags: async (companyId: string, runId: string) => {
      return db
        .select()
        .from(agentRunTags)
        .where(and(eq(agentRunTags.companyId, companyId), eq(agentRunTags.runId, runId)))
        .orderBy(desc(agentRunTags.createdAt));
    },

    addRunTag: async (companyId: string, runId: string, tag: string) => {
      const [row] = await db
        .insert(agentRunTags)
        .values({ companyId, runId, tag })
        .returning();
      return row;
    },

    removeRunTag: async (companyId: string, runId: string, tag: string) => {
      const [deleted] = await db
        .delete(agentRunTags)
        .where(
          and(
            eq(agentRunTags.companyId, companyId),
            eq(agentRunTags.runId, runId),
            eq(agentRunTags.tag, tag),
          ),
        )
        .returning();
      return deleted ?? null;
    },

    getRunStats: async (companyId: string) => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [totalRuns, runsLast24h, runsLast7d, succeededRuns, failedRuns] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(heartbeatRuns)
          .where(eq(heartbeatRuns.companyId, companyId))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, dayAgo)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, weekAgo)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.status, "succeeded")))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.status, "failed")))
          .then((rows) => Number(rows[0]?.count ?? 0)),
      ]);

      return {
        totalRuns,
        runsLast24h,
        runsLast7d,
        succeededRuns,
        failedRuns,
        successRate: totalRuns > 0 ? Number(((succeededRuns / totalRuns) * 100).toFixed(2)) : 0,
      };
    },
  };
}
