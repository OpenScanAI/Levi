import { logger } from "../middleware/logger.js";
import type { MemoryService } from "./MemoryService.js";
import type { RetrievedMemory } from "./MemoryTypes.js";

export interface MemoryInjectionInput {
  memoryService: MemoryService;
  companyId: string;
  projectId: string;
  agentId: string;
  agentRole: string;
  /** Current task title or goal description - used as the search query */
  taskDescription: string;
  /** Goal ancestry chain e.g. ["mission-1", "goal-5", "task-42"] */
  goalAncestry?: string[];
  /** Max tokens to spend on memory context. Default: 2000 */
  memoryBudget?: number;
}

export interface MemoryInjectionResult {
  /** Formatted memory context string to prepend to agent env */
  contextBlock: string;
  /** Raw memories that were retrieved */
  memories: RetrievedMemory[];
  /** Approximate token count used */
  tokenCount: number;
  /** Whether memory was skipped (disabled, error, or budget=0) */
  skipped: boolean;
}

const DEFAULT_MEMORY_BUDGET = 2000;

function estimateTokens(totalChars: number): number {
  if (totalChars <= 0) return 0;
  return Math.ceil(totalChars / 4);
}

function buildSkippedResult(): MemoryInjectionResult {
  return {
    contextBlock: "",
    memories: [],
    tokenCount: 0,
    skipped: true,
  };
}

function formatMemoryLine(index: number, memory: RetrievedMemory): string[] {
  const memoryType = memory.metadata?.memory_type ?? "unknown";
  const confidence = typeof memory.confidence === "number" ? memory.confidence : 0;
  const agentId = memory.metadata?.agent_id ?? "unknown";
  const taskId = memory.metadata?.task_id ?? "unknown";

  return [
    `[${index}] (${memoryType}) ${memory.content}`,
    `    Agent: ${agentId} | Task: ${taskId} | Confidence: ${confidence.toFixed(2)}`,
  ];
}

export async function injectMemories(input: MemoryInjectionInput): Promise<MemoryInjectionResult> {
  if (!input.memoryService.enabled) {
    return buildSkippedResult();
  }

  const memoryBudget = input.memoryBudget ?? DEFAULT_MEMORY_BUDGET;
  if (memoryBudget <= 0) {
    return buildSkippedResult();
  }

  const query = `${input.taskDescription} ${input.goalAncestry?.join(" ") ?? ""}`.trim();

  let memories: RetrievedMemory[] = [];
  try {
    memories = await input.memoryService.query({
      query,
      company_id: input.companyId,
      project_id: input.projectId,
      agent_id: input.agentId,
      agent_role: input.agentRole,
      topK: 15,
    });
  } catch (err) {
    logger.warn({ err }, "Memory injection query failed");
    return buildSkippedResult();
  }

  if (memories.length === 0) {
    return buildSkippedResult();
  }

  const selected: RetrievedMemory[] = [];
  let totalChars = 0;
  for (const memory of memories) {
    const contentLength = typeof memory.content === "string" ? memory.content.length : 0;
    const nextChars = totalChars + contentLength;
    const nextTokens = estimateTokens(nextChars);
    if (nextTokens > memoryBudget) {
      break;
    }
    selected.push(memory);
    totalChars = nextChars;
  }

  if (selected.length === 0) {
    return buildSkippedResult();
  }

  const tokenCount = estimateTokens(totalChars);
  const lines: string[] = [];
  selected.forEach((memory, index) => {
    lines.push(...formatMemoryLine(index + 1, memory));
  });

  return {
    contextBlock: lines.join("\n"),
    memories: selected,
    tokenCount,
    skipped: false,
  };
}
