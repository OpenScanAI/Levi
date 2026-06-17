import { logger } from "../middleware/logger.js";
import type { MemoryService } from "./MemoryService.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { MemoryMetadata } from "./MemoryTypes.js";

export interface MemoryMigrationResult {
  imported: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export interface MemoryMigrationOptions {
  companyId: string;
  projectId?: string;
  agentId?: string;
  dryRun?: boolean;
  batchSize?: number;
}

interface ActivityLogRow {
  id: string;
  company_id: string;
  project_id: string | null;
  agent_id: string | null;
  action: string;
  details: unknown;
  created_at: Date;
}

interface HeartbeatRunRow {
  id: string;
  company_id: string;
  project_id: string;
  agent_id: string;
  status: string;
  result_summary: string | null;
  stderr_excerpt: string | null;
  cost_cents: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Migrate historical activity logs and run data into the memory system.
 * This is a one-time operation that extracts decisions, errors, and outcomes
 * from existing activity logs and run records.
 */
export async function migrateHistoricalMemories(
  db: any,
  memoryService: MemoryService,
  options: MemoryMigrationOptions,
): Promise<MemoryMigrationResult> {
  const startTime = Date.now();
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  if (!memoryService.enabled) {
    logger.warn("Memory service is disabled — skipping migration");
    return { imported: 0, skipped: 0, errors: 0, durationMs: 0 };
  }

  const { companyId, projectId, agentId, dryRun = false, batchSize = 100 } = options;

  try {
    // Migrate from activity_log table — extract decisions and errors
    const activityLogs = await db.query.activityLog.findMany({
      where: (logs: any, { eq, and }: { eq: any; and: any }) => {
        const conditions = [eq(logs.companyId, companyId)];
        if (projectId) conditions.push(eq(logs.projectId, projectId));
        if (agentId) conditions.push(eq(logs.agentId, agentId));
        return and(...conditions);
      },
      limit: batchSize,
    });

    for (const log of activityLogs as ActivityLogRow[]) {
      try {
        const memoryType = inferMemoryTypeFromAction(log.action);
        if (!memoryType) {
          skipped++;
          continue;
        }

        if (dryRun) {
          imported++;
          continue;
        }

        const metadata: MemoryMetadata = {
          company_id: log.company_id,
          project_id: log.project_id ?? "unknown",
          agent_id: log.agent_id ?? "system",
          task_id: log.id,
          goal_ancestry: [],
          agent_role: "Agent",
          timestamp: log.created_at.toISOString(),
          run_id: log.id,
          cost: 0,
          memory_type: memoryType,
          visibility: MemoryVisibility.Shared,
        };

        await memoryService.store({
          companyId: log.company_id,
          projectId: log.project_id ?? "unknown",
          agentId: log.agent_id ?? "system",
          content: JSON.stringify({
            action: log.action,
            details: log.details,
            migrated: true,
            source: "activity_log",
          }),
          metadata,
        });

        imported++;
      } catch (err) {
        logger.warn({ err, logId: log.id }, "Failed to migrate activity log to memory");
        errors++;
      }
    }

    // Migrate from heartbeat_runs table — extract result summaries and errors
    const runs = await db.query.heartbeatRuns.findMany({
      where: (runs: any, { eq, and }: { eq: any; and: any }) => {
        const conditions = [eq(runs.companyId, companyId)];
        if (projectId) conditions.push(eq(runs.projectId, projectId));
        if (agentId) conditions.push(eq(runs.agentId, agentId));
        return and(...conditions);
      },
      limit: batchSize,
    });

    for (const run of runs as HeartbeatRunRow[]) {
      try {
        if (dryRun) {
          imported++;
          continue;
        }

        // Store result summary as decision memory
        if (run.result_summary) {
          const decisionMetadata: MemoryMetadata = {
            company_id: run.company_id,
            project_id: run.project_id,
            agent_id: run.agent_id,
            task_id: run.id,
            goal_ancestry: [],
            agent_role: "Agent",
            timestamp: run.created_at.toISOString(),
            run_id: run.id,
            cost: (run.cost_cents ?? 0) / 100,
            memory_type: MemoryType.Decision,
            visibility: MemoryVisibility.Shared,
          };

          await memoryService.store({
            companyId: run.company_id,
            projectId: run.project_id,
            agentId: run.agent_id,
            content: run.result_summary,
            metadata: decisionMetadata,
          });

          imported++;
        }

        // Store stderr as error memory
        if (run.stderr_excerpt) {
          const errorMetadata: MemoryMetadata = {
            company_id: run.company_id,
            project_id: run.project_id,
            agent_id: run.agent_id,
            task_id: run.id,
            goal_ancestry: [],
            agent_role: "Agent",
            timestamp: run.created_at.toISOString(),
            run_id: run.id,
            cost: (run.cost_cents ?? 0) / 100,
            memory_type: MemoryType.Error,
            visibility: MemoryVisibility.Shared,
          };

          await memoryService.store({
            companyId: run.company_id,
            projectId: run.project_id,
            agentId: run.agent_id,
            content: run.stderr_excerpt,
            metadata: errorMetadata,
          });

          imported++;
        }
      } catch (err) {
        logger.warn({ err, runId: run.id }, "Failed to migrate run to memory");
        errors++;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Memory migration failed");
    errors++;
  }

  const durationMs = Date.now() - startTime;

  logger.info(
    { imported, skipped, errors, durationMs, companyId, projectId, agentId, dryRun },
    "Memory migration completed",
  );

  return { imported, skipped, errors, durationMs };
}

function inferMemoryTypeFromAction(action: string): MemoryType | null {
  const actionLower = action.toLowerCase();

  if (actionLower.includes("error") || actionLower.includes("fail") || actionLower.includes("crash")) {
    return MemoryType.Error;
  }

  if (actionLower.includes("decision") || actionLower.includes("chose") || actionLower.includes("selected")) {
    return MemoryType.Decision;
  }

  if (actionLower.includes("code") || actionLower.includes("implement") || actionLower.includes("merge")) {
    return MemoryType.CodeChange;
  }

  if (actionLower.includes("arch") || actionLower.includes("design") || actionLower.includes("structure")) {
    return MemoryType.Architecture;
  }

  // Skip actions that don't map to memory types
  return null;
}

/**
 * Check if migration has already been run for a company.
 */
export async function hasMigrationBeenRun(db: any, companyId: string): Promise<boolean> {
  try {
    // Check if any migrated memories exist by querying the memory service
    const memories = await db.query.heartbeatRuns.findMany({
      where: (runs: any, { eq }: { eq: any }) => eq(runs.companyId, companyId),
      limit: 1,
    });

    return memories.length > 0;
  } catch {
    return false;
  }
}
