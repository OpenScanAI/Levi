import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvals, heartbeatRuns, costEvents } from "@paperclipai/db";

const ANALYTICS_DAYS = 14;

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getRecentUtcDateKeys(now: Date, days: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Array.from({ length: days }, (_, index) => {
    const dayOffset = index - (days - 1);

    return formatUtcDateKey(
      new Date(todayUtc + dayOffset * 24 * 60 * 60 * 1000),
    );
  });
}

export function agentAnalyticsService(db: Db) {
  return {
    summary: async (companyId: string) => {
      const now = new Date();

      const analyticsDays = getRecentUtcDateKeys(now, ANALYTICS_DAYS);

      const analyticsStart = new Date(
        `${analyticsDays[0]}T00:00:00.000Z`,
      );

      const runDayExpr = sql<string>`
        to_char(${heartbeatRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD')
      `;

      const runRows = await db
        .select({
          date: runDayExpr,
          status: heartbeatRuns.status,
          count: sql<number>`count(*)::double precision`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, analyticsStart),
          ),
        )
        .groupBy(runDayExpr, heartbeatRuns.status);

      const tasksCompletedOverTime = new Map(
        analyticsDays.map((date) => [
          date,
          {
            date,
            completed: 0,
            failed: 0,
            total: 0,
          },
        ]),
      );

      for (const row of runRows) {
        const bucket = tasksCompletedOverTime.get(row.date);

        if (!bucket) continue;

        const count = Number(row.count);

        if (row.status === "succeeded") {
          bucket.completed += count;
        } else if (
          row.status === "failed" ||
          row.status === "timed_out"
        ) {
          bucket.failed += count;
        }

        bucket.total += count;
      }

      const approvedCount = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            eq(approvals.status, "approved"),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const totalApprovalCount = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(approvals)
        .where(eq(approvals.companyId, companyId))
        .then((rows) => Number(rows[0]?.count ?? 0));

      const approvalRate =
        totalApprovalCount > 0
          ? (approvedCount / totalApprovalCount) * 100
          : 0;

      const failedRuns = Array.from(tasksCompletedOverTime.values())
        .reduce((sum, item) => sum + item.failed, 0);

      const totalRuns = Array.from(tasksCompletedOverTime.values())
        .reduce((sum, item) => sum + item.total, 0);

      const errorRate =
        totalRuns > 0
          ? (failedRuns / totalRuns) * 100
          : 0;

      const [{ totalCost }] = await db
        .select({
          totalCost: sql<number>`
            coalesce(sum(${costEvents.costCents}), 0)::double precision
          `,
        })
        .from(costEvents)
        .where(eq(costEvents.companyId, companyId));

      const averageCostPerTask =
        totalRuns > 0
          ? Number(totalCost) / totalRuns
          : 0;

      return {
        tasksCompletedOverTime: Array.from(
          tasksCompletedOverTime.values(),
        ),
        approvalRate: Number(approvalRate.toFixed(2)),
        errorRate: Number(errorRate.toFixed(2)),
        averageCostPerTask: Number(
          averageCostPerTask.toFixed(2),
        ),
      };
    },
  };
}
    
