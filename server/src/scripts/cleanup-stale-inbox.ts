/**
 * Cleanup script for stale failed inbox items.
 *
 * Run via: npx tsx server/src/scripts/cleanup-stale-inbox.ts
 *
 * This script:
 * 1. Archives old failed runs (dismisses them from sidebar badges)
 * 2. Resolves stale recovery actions that have exceeded max attempts
 * 3. Identifies agents with repeated failures
 * 4. Optionally pauses agents with high failure rates
 */

import { and, desc, eq, gt, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { createDb } from "@paperclipai/db";
import {
  agents,
  heartbeatRuns,
  issueRecoveryActions,
  issues,
  inboxDismissals,
} from "@paperclipai/db";

const STALE_FAILED_RUN_DAYS = 7;
const STALE_RECOVERY_ACTION_DAYS = 14;
const HIGH_FAILURE_THRESHOLD = 10;
const FAILURE_WINDOW_DAYS = 7;

interface CleanupResult {
  dismissedRuns: number;
  resolvedRecoveryActions: number;
  highFailureAgents: Array<{
    agentId: string;
    agentName: string;
    failureCount: number;
    recommendedAction: string;
  }>;
  archivedIssues: number;
}

async function cleanupStaleInbox(databaseUrl: string): Promise<CleanupResult> {
  const db = createDb(databaseUrl);
  const now = new Date();
  const staleRunCutoff = new Date(now.getTime() - STALE_FAILED_RUN_DAYS * 24 * 60 * 60 * 1000);
  const staleRecoveryCutoff = new Date(now.getTime() - STALE_RECOVERY_ACTION_DAYS * 24 * 60 * 60 * 1000);
  const failureWindowCutoff = new Date(now.getTime() - FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const result: CleanupResult = {
    dismissedRuns: 0,
    resolvedRecoveryActions: 0,
    highFailureAgents: [],
    archivedIssues: 0,
  };

  // 1. Dismiss stale failed runs from sidebar badges
  const staleFailedRuns = await db
    .select({
      id: heartbeatRuns.id,
      agentId: heartbeatRuns.agentId,
      companyId: heartbeatRuns.companyId,
      status: heartbeatRuns.status,
      createdAt: heartbeatRuns.createdAt,
    })
    .from(heartbeatRuns)
    .where(
      and(
        inArray(heartbeatRuns.status, ["failed", "timed_out"]),
        lte(heartbeatRuns.createdAt, staleRunCutoff),
      ),
    );

  for (const run of staleFailedRuns) {
    // Insert dismissal record so sidebar badges ignore this run
    await db
      .insert(inboxDismissals)
      .values({
        companyId: run.companyId,
        userId: "system_cleanup",
        itemKey: `run:${run.id}`,
        dismissedAt: now,
      })
      .onConflictDoNothing();
    result.dismissedRuns++;
  }

  console.log(`Dismissed ${result.dismissedRuns} stale failed runs from inbox`);

  // 2. Resolve stale recovery actions that have been active too long
  const staleRecoveryActions = await db
    .select()
    .from(issueRecoveryActions)
    .where(
      and(
        inArray(issueRecoveryActions.status, ["active", "escalated"]),
        lte(issueRecoveryActions.createdAt, staleRecoveryCutoff),
      ),
    );

  for (const action of staleRecoveryActions) {
    await db
      .update(issueRecoveryActions)
      .set({
        status: "resolved",
        outcome: "false_positive",
        resolutionNote: "Auto-resolved by stale inbox cleanup: exceeded max age without resolution",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(issueRecoveryActions.id, action.id));
    result.resolvedRecoveryActions++;
  }

  console.log(`Resolved ${result.resolvedRecoveryActions} stale recovery actions`);

  // 3. Identify agents with high failure rates in the last window
  const failureCounts = await db
    .select({
      agentId: heartbeatRuns.agentId,
      count: sql<number>`count(${heartbeatRuns.id})`,
    })
    .from(heartbeatRuns)
    .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
    .where(
      and(
        eq(heartbeatRuns.companyId, agents.companyId),
        inArray(heartbeatRuns.status, ["failed", "timed_out"]),
        gt(heartbeatRuns.createdAt, failureWindowCutoff),
        ne(agents.status, "terminated"),
      ),
    )
    .groupBy(heartbeatRuns.agentId);

  for (const row of failureCounts) {
    if (row.count >= HIGH_FAILURE_THRESHOLD) {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, row.agentId))
        .then((rows) => rows[0]);

      if (agent) {
        result.highFailureAgents.push({
          agentId: row.agentId,
          agentName: agent.name,
          failureCount: row.count,
          recommendedAction: row.count >= 20 ? "pause" : "review",
        });

        // Auto-pause agents with extreme failure rates
        if (row.count >= 20 && agent.status !== "paused") {
          await db
            .update(agents)
            .set({
              status: "paused",
              pauseReason: "system",
              pausedAt: now,
              updatedAt: now,
            })
            .where(eq(agents.id, row.agentId));
          console.log(`Auto-paused agent ${agent.name} (${row.agentId}) due to ${row.count} failures in ${FAILURE_WINDOW_DAYS} days`);
        }
      }
    }
  }

  console.log(`Identified ${result.highFailureAgents.length} high-failure agents`);

  // 4. Archive very old stuck issues (todo/in_progress with no activity for 30 days)
  const veryStaleIssueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const staleIssues = await db
    .select({ id: issues.id, companyId: issues.companyId })
    .from(issues)
    .where(
      and(
        inArray(issues.status, ["todo", "in_progress"]),
        lte(issues.updatedAt, veryStaleIssueCutoff),
        isNull(issues.hiddenAt),
      ),
    );

  for (const issue of staleIssues) {
    await db
      .update(issues)
      .set({
        status: "cancelled",
        hiddenAt: now,
        updatedAt: now,
      })
      .where(eq(issues.id, issue.id));
    result.archivedIssues++;
  }

  console.log(`Archived ${result.archivedIssues} very stale issues`);

  return result;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  console.log("Starting stale inbox cleanup...");
  const result = await cleanupStaleInbox(databaseUrl);

  console.log("\n=== Cleanup Summary ===");
  console.log(`Dismissed stale failed runs: ${result.dismissedRuns}`);
  console.log(`Resolved stale recovery actions: ${result.resolvedRecoveryActions}`);
  console.log(`Archived very stale issues: ${result.archivedIssues}`);
  console.log(`High-failure agents identified: ${result.highFailureAgents.length}`);

  if (result.highFailureAgents.length > 0) {
    console.log("\nHigh-failure agents:");
    for (const agent of result.highFailureAgents) {
      console.log(`  - ${agent.agentName} (${agent.agentId}): ${agent.failureCount} failures, recommend: ${agent.recommendedAction}`);
    }
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
