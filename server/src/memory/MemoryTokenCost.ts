import type { Db } from "@paperclipai/db";
import { costEvents } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

export interface MemoryTokenCostInput {
  companyId: string;
  agentId: string;
  heartbeatRunId: string;
  projectId?: string;
  issueId?: string;
  tokenCount: number;
}

export function estimateMemoryCostCents(tokenCount: number): number {
  return Math.ceil(tokenCount * 0.0001);
}

export async function recordMemoryCostEvent(db: Db, input: MemoryTokenCostInput): Promise<void> {
  try {
    await db.insert(costEvents).values({
      companyId: input.companyId,
      agentId: input.agentId,
      heartbeatRunId: input.heartbeatRunId,
      projectId: input.projectId ?? null,
      issueId: input.issueId ?? null,
      provider: "agentmemory",
      biller: "agentmemory",
      billingType: "subscription_included",
      model: "bm25+semantic",
      inputTokens: input.tokenCount,
      outputTokens: 0,
      cachedInputTokens: 0,
      costCents: estimateMemoryCostCents(input.tokenCount),
      occurredAt: new Date(),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to record memory cost event");
  }
}
