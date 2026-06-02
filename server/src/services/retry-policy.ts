/**
 * Retry policy service for automatic retry of transient failures.
 *
 * Rules:
 * - Retry timeouts, temporary API errors, and runtime startup failures
 * - Maximum 3 retry attempts with exponential backoff
 * - Do NOT retry invalid credentials or configuration errors
 * - Log all retry attempts and recovery results
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

/** Error codes that are considered transient and should be retried */
export const RETRYABLE_ERROR_CODES = [
  "timeout",
  "codex_transient_upstream",
  "claude_transient_upstream",
  "process_lost",
  "process_detached",
  "adapter_failed",
  "runtime_startup_failed",
  "network_error",
  "connection_reset",
  "connection_refused",
  "dns_error",
  "rate_limited",
  "service_unavailable",
  "gateway_timeout",
  "internal_server_error",
] as const;

/** Error codes that should NEVER be retried (credentials, config, auth) */
export const NON_RETRYABLE_ERROR_CODES = [
  "invalid_credentials",
  "authentication_failed",
  "unauthorized",
  "forbidden",
  "invalid_configuration",
  "configuration_error",
  "missing_api_key",
  "invalid_api_key",
  "quota_exceeded",
  "budget_blocked",
  "agent_not_invokable",
] as const;

/** Maximum retry attempts for any single run */
export const MAX_RETRY_ATTEMPTS = 3;

/** Backoff delays in ms: 30s, 2min, 5min */
export const RETRY_BACKOFF_DELAYS_MS = [30_000, 120_000, 300_000] as const;

/** Jitter ratio to avoid thundering herd */
const RETRY_JITTER_RATIO = 0.25;

export type RetryableErrorCode = (typeof RETRYABLE_ERROR_CODES)[number];
export type NonRetryableErrorCode = (typeof NON_RETRYABLE_ERROR_CODES)[number];

export interface RetryMetrics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  exhaustedRetries: number;
  recoveryRate: number;
  retryActivity: Array<{
    date: string;
    retried: number;
    recovered: number;
    failedAfterRetries: number;
    exhausted: number;
  }>;
  retriedAgents: Array<{
    agentId: string;
    agentName: string;
    retryCount: number;
    successCount: number;
    failureCount: number;
  }>;
}

function isRetryableErrorCode(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return (RETRYABLE_ERROR_CODES as readonly string[]).includes(errorCode);
}

function isNonRetryableErrorCode(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return (NON_RETRYABLE_ERROR_CODES as readonly string[]).includes(errorCode);
}

function computeRetryDelay(attempt: number): number {
  if (attempt < 1 || attempt > MAX_RETRY_ATTEMPTS) return 0;
  const baseDelay = RETRY_BACKOFF_DELAYS_MS[attempt - 1];
  if (!baseDelay) return 0;
  const jitter = 1 + ((Math.random() * 2 - 1) * RETRY_JITTER_RATIO);
  return Math.max(1000, Math.round(baseDelay * jitter));
}

export function retryPolicyService(db: Db) {
  /**
   * Determine if a failed run should be automatically retried.
   */
  function shouldRetry(run: Pick<typeof heartbeatRuns.$inferSelect, "errorCode" | "status" | "scheduledRetryAttempt">): {
    shouldRetry: boolean;
    reason: string;
    attempt: number;
    delayMs: number;
  } {
    const attempt = (run.scheduledRetryAttempt ?? 0) + 1;

    if (run.status !== "failed" && run.status !== "timed_out") {
      return { shouldRetry: false, reason: "run did not fail", attempt, delayMs: 0 };
    }

    if (attempt > MAX_RETRY_ATTEMPTS) {
      return { shouldRetry: false, reason: `max retries (${MAX_RETRY_ATTEMPTS}) exceeded`, attempt, delayMs: 0 };
    }

    if (isNonRetryableErrorCode(run.errorCode)) {
      return { shouldRetry: false, reason: `error code ${run.errorCode} is not retryable`, attempt, delayMs: 0 };
    }

    if (!isRetryableErrorCode(run.errorCode)) {
      return { shouldRetry: false, reason: `error code ${run.errorCode} is not classified as retryable`, attempt, delayMs: 0 };
    }

    const delayMs = computeRetryDelay(attempt);
    return { shouldRetry: true, reason: "transient failure eligible for retry", attempt, delayMs };
  }

  /**
   * Get retry metrics for dashboard display.
   */
  async function getRetryMetrics(companyId: string, windowHours = 24): Promise<RetryMetrics> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // Build daily activity buckets for the window
    const dayKeys: string[] = [];
    const dayStart = new Date(since);
    dayStart.setUTCHours(0, 0, 0, 0);
    const now = new Date();
    while (dayStart <= now) {
      dayKeys.push(dayStart.toISOString().slice(0, 10));
      dayStart.setUTCDate(dayStart.getUTCDate() + 1);
    }
    const activityMap = new Map(
      dayKeys.map((date) => [
        date,
        { date, retried: 0, recovered: 0, failedAfterRetries: 0, exhausted: 0 },
      ]),
    );

    const dateExpr = sql<string>`date(${heartbeatRuns.createdAt})`;

    const retriedRuns = await db
      .select({
        agentId: heartbeatRuns.agentId,
        status: heartbeatRuns.status,
        scheduledRetryAttempt: heartbeatRuns.scheduledRetryAttempt,
        date: dateExpr,
        count: sql<number>`count(*)`,
      })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          gt(heartbeatRuns.createdAt, since),
          sql`${heartbeatRuns.scheduledRetryAttempt} > 0`,
        ),
      )
      .groupBy(
        heartbeatRuns.agentId,
        heartbeatRuns.status,
        heartbeatRuns.scheduledRetryAttempt,
        dateExpr,
      );

    const agentMap = new Map<
      string,
      { agentId: string; agentName: string; retryCount: number; successCount: number; failureCount: number }
    >();

    let totalRetries = 0;
    let successfulRetries = 0;
    let failedRetries = 0;
    let exhaustedRetries = 0;

    for (const row of retriedRuns) {
      const attempt = row.scheduledRetryAttempt ?? 0;
      totalRetries += Number(row.count);

      const day = row.date;
      const dayEntry = activityMap.get(day);
      if (dayEntry) {
        dayEntry.retried += Number(row.count);
        if (row.status === "succeeded") {
          dayEntry.recovered += Number(row.count);
        } else if (row.status === "failed" || row.status === "timed_out") {
          dayEntry.failedAfterRetries += Number(row.count);
          if (attempt >= MAX_RETRY_ATTEMPTS) {
            dayEntry.exhausted += Number(row.count);
          }
        }
      }

      if (row.status === "succeeded") {
        successfulRetries += Number(row.count);
      } else if (row.status === "failed" || row.status === "timed_out") {
        failedRetries += Number(row.count);
        if (attempt >= MAX_RETRY_ATTEMPTS) {
          exhaustedRetries += Number(row.count);
        }
      }

      // Build per-agent stats (agent name resolved later)
      const existing = agentMap.get(row.agentId);
      if (existing) {
        existing.retryCount += Number(row.count);
        if (row.status === "succeeded") existing.successCount += Number(row.count);
        if (row.status === "failed" || row.status === "timed_out") existing.failureCount += Number(row.count);
      } else {
        agentMap.set(row.agentId, {
          agentId: row.agentId,
          agentName: "", // resolved below
          retryCount: Number(row.count),
          successCount: row.status === "succeeded" ? row.count : 0,
          failureCount: row.status === "failed" || row.status === "timed_out" ? row.count : 0,
        });
      }
    }

    // Resolve agent names
    const { agents } = await import("@paperclipai/db");
    const agentIds = Array.from(agentMap.keys());
    if (agentIds.length > 0) {
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(inArray(agents.id, agentIds));
      for (const a of agentRows) {
        const entry = agentMap.get(a.id);
        if (entry) entry.agentName = a.name;
      }
    }

    const recoveryRate = totalRetries > 0 ? Number(((successfulRetries / totalRetries) * 100).toFixed(1)) : 0;

    return {
      totalRetries,
      successfulRetries,
      failedRetries,
      exhaustedRetries,
      recoveryRate,
      retryActivity: Array.from(activityMap.values()),
      retriedAgents: Array.from(agentMap.values()),
    };
  }

  /**
   * Log a retry decision for observability.
   */
  function logRetryDecision(
    runId: string,
    agentId: string,
    decision: { shouldRetry: boolean; reason: string; attempt: number; delayMs: number },
    errorCode: string | null | undefined,
  ) {
    if (decision.shouldRetry) {
      logger.info(
        { runId, agentId, attempt: decision.attempt, delayMs: decision.delayMs, errorCode },
        `retry_policy: scheduling retry attempt ${decision.attempt}/${MAX_RETRY_ATTEMPTS} in ${Math.round(decision.delayMs / 1000)}s`,
      );
    } else {
      logger.warn(
        { runId, agentId, attempt: decision.attempt, errorCode, reason: decision.reason },
        "retry_policy: not retrying",
      );
    }
  }

  return {
    shouldRetry,
    getRetryMetrics,
    logRetryDecision,
    isRetryableErrorCode,
    isNonRetryableErrorCode,
    MAX_RETRY_ATTEMPTS,
    RETRY_BACKOFF_DELAYS_MS,
  };
}
