import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentFindings, agents, heartbeatRuns } from "@paperclipai/db";
import type { FindingSeverity } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { publishLiveEvent } from "./live-events.js";

/**
 * Filters for querying agent findings.
 */
export interface FindingsFilters {
  companyId: string;
  agentId?: string;
  runId?: string;
  severity?: FindingSeverity;
  verified?: boolean;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

const DEFAULT_FINDINGS_LIMIT = 100;
const MAX_FINDINGS_LIMIT = 500;

/**
 * Clamp findings query limit to valid range.
 */
export function normalizeFindingsLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_FINDINGS_LIMIT;
  return Math.max(1, Math.min(MAX_FINDINGS_LIMIT, Math.floor(limit ?? DEFAULT_FINDINGS_LIMIT)));
}

/**
 * Service for managing agent security findings.
 * Provides CRUD operations, filtering, verification, and severity summaries.
 */
export function findingsService(db: Db) {
  return {
    create: async (input: {
      companyId: string;
      agentId: string;
      runId?: string | null;
      severity: FindingSeverity;
      category?: string | null;
      title: string;
      description?: string | null;
      cvssScore?: number | null;
      metadata?: Record<string, unknown> | null;
      actorId?: string;
    }) => {
      const [finding] = await db
        .insert(agentFindings)
        .values({
          companyId: input.companyId,
          agentId: input.agentId,
          runId: input.runId ?? null,
          severity: input.severity,
          category: input.category ?? null,
          title: input.title,
          description: input.description ?? null,
          cvssScore: input.cvssScore ?? null,
          metadata: input.metadata ?? null,
          updatedAt: new Date(),
        })
        .returning();

      await logActivity(db, {
        companyId: input.companyId,
        actorType: "system",
        actorId: input.actorId ?? "system",
        action: "finding_created",
        entityType: "finding",
        entityId: finding.id,
        agentId: input.agentId,
        details: { severity: input.severity, title: input.title },
      });

      // Publish live event for dashboard WebSocket feed
      publishLiveEvent({
        companyId: input.companyId,
        type: "agent.finding.created",
        payload: {
          findingId: finding.id,
          agentId: input.agentId,
          runId: input.runId ?? null,
          severity: input.severity,
          category: input.category ?? null,
          title: input.title,
          cvssScore: input.cvssScore ?? null,
        },
      });

      return finding;
    },

    list: async (filters: FindingsFilters) => {
      const limit = normalizeFindingsLimit(filters.limit);
      const offset = Math.max(0, filters.offset ?? 0);

      const conditions = [eq(agentFindings.companyId, filters.companyId)];
      if (filters.agentId) conditions.push(eq(agentFindings.agentId, filters.agentId));
      if (filters.runId) conditions.push(eq(agentFindings.runId, filters.runId));
      if (filters.severity) conditions.push(eq(agentFindings.severity, filters.severity));
      if (filters.verified !== undefined) conditions.push(eq(agentFindings.verified, filters.verified));
      if (filters.category) conditions.push(eq(agentFindings.category, filters.category));
      if (filters.dateFrom) conditions.push(gte(agentFindings.createdAt, filters.dateFrom));
      if (filters.dateTo) conditions.push(lte(agentFindings.createdAt, filters.dateTo));

      const rows = await db
        .select()
        .from(agentFindings)
        .where(and(...conditions))
        .orderBy(desc(agentFindings.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentFindings)
        .where(and(...conditions));

      return {
        findings: rows,
        total: Number(count),
        limit,
        offset,
      };
    },

    getById: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(agentFindings)
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.id, id)))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    update: async (
      companyId: string,
      id: string,
      input: {
        severity?: FindingSeverity;
        category?: string | null;
        title?: string;
        description?: string | null;
        cvssScore?: number | null;
        metadata?: Record<string, unknown> | null;
      },
    ) => {
      const [updated] = await db
        .update(agentFindings)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.id, id)))
        .returning();
      return updated ?? null;
    },

    verify: async (companyId: string, id: string, verifiedBy: string) => {
      const [updated] = await db
        .update(agentFindings)
        .set({
          verified: true,
          verifiedBy,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.id, id)))
        .returning();

      if (updated) {
        await logActivity(db, {
          companyId,
          actorType: "user",
          actorId: verifiedBy,
          action: "finding_verified",
          entityType: "finding",
          entityId: id,
          agentId: updated.agentId,
          details: { title: updated.title },
        });
      }

      return updated ?? null;
    },

    delete: async (companyId: string, id: string) => {
      const [deleted] = await db
        .delete(agentFindings)
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.id, id)))
        .returning();
      return deleted ?? null;
    },

    listByRun: async (companyId: string, runId: string) => {
      return db
        .select()
        .from(agentFindings)
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.runId, runId)))
        .orderBy(desc(agentFindings.createdAt));
    },

    listByAgent: async (companyId: string, agentId: string) => {
      return db
        .select()
        .from(agentFindings)
        .where(and(eq(agentFindings.companyId, companyId), eq(agentFindings.agentId, agentId)))
        .orderBy(desc(agentFindings.createdAt));
    },

    summary: async (companyId: string) => {
      const rows = await db
        .select({
          severity: agentFindings.severity,
          count: sql<number>`count(*)::double precision`,
          verified: sql<number>`sum(case when ${agentFindings.verified} = true then 1 else 0 end)::double precision`,
          unverified: sql<number>`sum(case when ${agentFindings.verified} = false then 1 else 0 end)::double precision`,
        })
        .from(agentFindings)
        .where(eq(agentFindings.companyId, companyId))
        .groupBy(agentFindings.severity);

      return rows.map((row) => ({
        severity: row.severity,
        count: Number(row.count),
        verified: Number(row.verified),
        unverified: Number(row.unverified),
      }));
    },
  };
}
