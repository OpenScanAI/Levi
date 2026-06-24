import { eq, and, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, agentFindings, agents } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { notificationsService } from "./notifications.js";

const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let digestTimer: ReturnType<typeof setInterval> | null = null;

export function startDailyDigestScheduler(db: Db) {
  if (digestTimer) {
    logger.warn({ msg: "Daily digest scheduler already running" });
    return;
  }

  logger.info({ msg: "Starting daily digest scheduler" });

  // Run immediately on startup, then every 24 hours
  void runDailyDigest(db).catch((err) => {
    logger.error({ msg: "Initial daily digest failed", error: String(err) });
  });

  digestTimer = setInterval(() => {
    void runDailyDigest(db).catch((err) => {
      logger.error({ msg: "Scheduled daily digest failed", error: String(err) });
    });
  }, DIGEST_INTERVAL_MS);
}

export function stopDailyDigestScheduler() {
  if (digestTimer) {
    clearInterval(digestTimer);
    digestTimer = null;
    logger.info({ msg: "Daily digest scheduler stopped" });
  }
}

async function runDailyDigest(db: Db) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  logger.info({ msg: "Running daily digest", date: today.toISOString() });

  // Get all companies with active notification configs for daily digest
  const companies = await db
    .selectDistinct({ companyId: heartbeatRuns.companyId })
    .from(heartbeatRuns)
    .where(gte(heartbeatRuns.createdAt, yesterday));

  const uniqueCompanyIds = [...new Set(companies.map((c) => c.companyId))];

  for (const companyId of uniqueCompanyIds) {
    try {
      await runCompanyDailyDigest(db, companyId, yesterday, today);
    } catch (err) {
      logger.error({ msg: "Company daily digest failed", companyId, error: String(err) });
    }
  }

  logger.info({ msg: "Daily digest complete", companies: uniqueCompanyIds.length });
}

async function runCompanyDailyDigest(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date,
) {
  const svc = notificationsService(db);

  // Check if company has daily digest enabled
  const configs = await svc.shouldNotifyForEvent(companyId, "daily_digest" as any);
  if (configs.length === 0) return;

  // Get run stats for the day
  const runStats = await db
    .select({
      status: heartbeatRuns.status,
      count: sql<number>`count(*)`,
    })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.companyId, companyId),
        gte(heartbeatRuns.createdAt, startDate),
        sql`${heartbeatRuns.createdAt} < ${endDate}`,
      ),
    )
    .groupBy(heartbeatRuns.status);

  const totalRuns = runStats.reduce((sum, r) => sum + Number(r.count), 0);
  const succeededRuns = Number(runStats.find((r) => r.status === "succeeded")?.count ?? 0);
  const failedRuns = Number(runStats.find((r) => r.status === "failed" || r.status === "timed_out")?.count ?? 0);
  const stuckRuns = Number(runStats.find((r) => r.status === "stuck")?.count ?? 0);

  // Get findings count for the day
  const findingsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentFindings)
    .where(
      and(
        eq(agentFindings.companyId, companyId),
        gte(agentFindings.createdAt, startDate),
        sql`${agentFindings.createdAt} < ${endDate}`,
      ),
    );
  const findingsCount = Number(findingsResult[0]?.count ?? 0);

  // Get top agents by run count for the day
  const topAgentsResult = await db
    .select({
      agentId: heartbeatRuns.agentId,
      count: sql<number>`count(*)`,
    })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.companyId, companyId),
        gte(heartbeatRuns.createdAt, startDate),
        sql`${heartbeatRuns.createdAt} < ${endDate}`,
      ),
    )
    .groupBy(heartbeatRuns.agentId)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  const topAgentsList = await Promise.all(
    topAgentsResult.map(async (row) => {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, row.agentId))
        .then((rows) => rows[0] ?? null);
      return {
        name: agent?.name ?? "Unknown Agent",
        runs: Number(row.count),
      };
    }),
  );

  // Dispatch daily digest
  await svc.dispatchDailyDigest(companyId, {
    companyName: "", // Will be filled by the notification formatter
    date: startDate.toISOString().split("T")[0],
    totalRuns,
    succeededRuns,
    failedRuns,
    stuckRuns,
    findingsCount,
    topAgents: topAgentsList,
  });

  logger.info({
    msg: "Company daily digest dispatched",
    companyId,
    totalRuns,
    findingsCount,
  });
}

// Cleanup on process exit
process.on("SIGINT", () => {
  stopDailyDigestScheduler();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopDailyDigestScheduler();
  process.exit(0);
});
