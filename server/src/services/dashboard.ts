import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, companies, costEvents, heartbeatRuns, issues } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { budgetService } from "./budgets.js";

const DASHBOARD_RUN_ACTIVITY_DAYS = 14;

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getRecentUtcDateKeys(now: Date, days: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const dayOffset = index - (days - 1);
    return formatUtcDateKey(new Date(todayUtc + dayOffset * 24 * 60 * 60 * 1000));
  });
}

export function dashboardService(db: Db) {
  const budgets = budgetService(db);
  return {
    summary: async (companyId: string) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const agentRows = await db
        .select({ status: agents.status, count: sql<number>`count(*)` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .groupBy(agents.status);

      const taskRows = await db
        .select({ status: issues.status, count: sql<number>`count(*)` })
        .from(issues)
        .where(eq(issues.companyId, companyId))
        .groupBy(issues.status);

      const pendingApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .then((rows) => Number(rows[0]?.count ?? 0));

      const agentCounts: Record<string, number> = {
        active: 0,
        running: 0,
        paused: 0,
        error: 0,
      };
      for (const row of agentRows) {
        const count = Number(row.count);
        // "idle" agents are operational — count them as active
        const bucket = row.status === "idle" ? "active" : row.status;
        agentCounts[bucket] = (agentCounts[bucket] ?? 0) + count;
      }

      const taskCounts: Record<string, number> = {
        open: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
      };
      for (const row of taskRows) {
        const count = Number(row.count);
        if (row.status === "in_progress") taskCounts.inProgress += count;
        if (row.status === "blocked") taskCounts.blocked += count;
        if (row.status === "done") taskCounts.done += count;
        if (row.status !== "done" && row.status !== "cancelled") taskCounts.open += count;
      }

      const now = new Date();
      const monthStart = getUtcMonthStart(now);
      const runActivityDays = getRecentUtcDateKeys(now, DASHBOARD_RUN_ACTIVITY_DAYS);
      const runActivityStart = new Date(`${runActivityDays[0]}T00:00:00.000Z`);
      const [{ monthSpend }] = await db
        .select({
          monthSpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, monthStart),
          ),
        );

      const monthSpendCents = Number(monthSpend);
      const runActivityDayExpr = sql<string>`to_char(${heartbeatRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
      const runActivityRows = await db
        .select({
          date: runActivityDayExpr,
          status: heartbeatRuns.status,
          count: sql<number>`count(*)::double precision`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, runActivityStart),
          ),
        )
        .groupBy(runActivityDayExpr, heartbeatRuns.status);

      const runActivity = new Map(
        runActivityDays.map((date) => [
          date,
          { date, succeeded: 0, failed: 0, other: 0, total: 0 },
        ]),
      );
      for (const row of runActivityRows) {
        const bucket = runActivity.get(row.date);
        if (!bucket) continue;
        const count = Number(row.count);
        if (row.status === "succeeded") bucket.succeeded += count;
        else if (row.status === "failed" || row.status === "timed_out") bucket.failed += count;
        else bucket.other += count;
        bucket.total += count;
      }

      const utilization =
        company.budgetMonthlyCents > 0
          ? (monthSpendCents / company.budgetMonthlyCents) * 100
          : 0;
      const budgetOverview = await budgets.overview(companyId);

      return {
        companyId,
        agents: {
          active: agentCounts.active,
          running: agentCounts.running,
          paused: agentCounts.paused,
          error: agentCounts.error,
        },
        tasks: taskCounts,
        costs: {
          monthSpendCents,
          monthBudgetCents: company.budgetMonthlyCents,
          monthUtilizationPercent: Number(utilization.toFixed(2)),
        },
        pendingApprovals,
        budgets: {
          activeIncidents: budgetOverview.activeIncidents.length,
          pendingApprovals: budgetOverview.pendingApprovalCount,
          pausedAgents: budgetOverview.pausedAgentCount,
          pausedProjects: budgetOverview.pausedProjectCount,
        },
        runActivity: Array.from(runActivity.values()),
      };
    },

    agentTelemetry: async (companyId: string) => {
      const activeAgents = await db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
          role: agents.role,
          adapterType: agents.adapterType,
        })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), eq(agents.status, "running")));

      const recentRuns = await db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          error: heartbeatRuns.error,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(50);

      return {
        activeAgents,
        recentRuns,
      };
    },

    recentRuns: async (companyId: string, limit = 20) => {
      return db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          invocationSource: heartbeatRuns.invocationSource,
          triggerDetail: heartbeatRuns.triggerDetail,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          error: heartbeatRuns.error,
          createdAt: heartbeatRuns.createdAt,
        })
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.companyId, companyId))
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(limit);
    },

    findingsSummary: async (companyId: string) => {
      const { agentFindings } = await import("@paperclipai/db");
      const rows = await db
        .select({
          severity: agentFindings.severity,
          count: sql<number>`count(*)::double precision`,
        })
        .from(agentFindings)
        .where(eq(agentFindings.companyId, companyId))
        .groupBy(agentFindings.severity);

      return rows.map((row) => ({
        severity: row.severity,
        count: Number(row.count),
      }));
    },

    stuckAgents: async (companyId: string) => {
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
      return db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
          lastRunAt: heartbeatRuns.startedAt,
        })
        .from(agents)
        .leftJoin(heartbeatRuns, eq(agents.id, heartbeatRuns.agentId))
        .where(
          and(
            eq(agents.companyId, companyId),
            or(
              eq(agents.status, "error"),
              and(
                eq(agents.status, "running"),
                gte(heartbeatRuns.startedAt, stuckThreshold),
              ),
            ),
          ),
        )
        .orderBy(desc(heartbeatRuns.startedAt));
    },
  };
}
