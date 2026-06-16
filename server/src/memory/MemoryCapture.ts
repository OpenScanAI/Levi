import { logger } from "../middleware/logger.js";
import type { MemoryService } from "./MemoryService.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { MemoryMetadata } from "./MemoryTypes.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunDetails {
  metadata: {
    companyId: string;
    projectId: string;
    agentId: string;
    agentRole: string;
    goalAncestry: string[];
    runId: string;
    cost: number;
  };
  artifacts: {
    toolCalls?: Array<{
      tool: string;
      input?: unknown;
      output?: unknown;
      error?: string;
    }>;
    resultSummary?: string;
    stderr?: string;
    codeDiffs?: Array<{
      path: string;
      operation: "created" | "modified" | "deleted";
      diff?: string;
    }>;
  };
}

export interface MemoryCaptureInput {
  memoryService: MemoryService;
  companyId: string;
  projectId: string;
  agentId: string;
  agentRole: string;
  taskId: string;
  runId: string;
  goalAncestry: string[];
  /** Raw stdout from the adapter run */
  stdout?: string | null;
  /** Raw stderr from the adapter run */
  stderr?: string | null;
  /** Structured result JSON from the adapter */
  resultJson?: Record<string, unknown> | null;
  /** Tool call traces if available */
  toolCalls?: Array<{
    tool: string;
    input?: unknown;
    output?: unknown;
    error?: string;
  }>;
  /** Code diffs / file changes */
  fileChanges?: Array<{
    path: string;
    operation: "created" | "modified" | "deleted";
    diff?: string;
  }>;
  /** Agent reasoning / comments */
  reasoning?: string | null;
  /** Whether the run succeeded or failed */
  outcome: "succeeded" | "failed" | "cancelled" | "timed_out";
  /** Optional cost tracking */
  costUsd?: number | null;
}

interface ExtractedMemory {
  content: string;
  memoryType: MemoryType;
  visibility: MemoryVisibility;
}

export interface MemoryCaptureResult {
  stored: number;
  skipped: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Consolidation trigger (best-effort, not exposed on all agentmemory versions)
// ---------------------------------------------------------------------------

async function triggerConsolidation(
  memoryService: MemoryService,
  companyId: string,
  projectId: string,
): Promise<void> {
  try {
    // @ts-expect-error triggerConsolidation may not exist on all agentmemory builds
    if (typeof memoryService.triggerConsolidation === "function") {
      // @ts-expect-error
      await memoryService.triggerConsolidation({ companyId, projectId });
    }
  } catch {
    // Silently ignore — consolidation is optional enhancement
  }
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

function buildMetadata(input: MemoryCaptureInput, memoryType: MemoryType, visibility: MemoryVisibility): MemoryMetadata {
  return {
    company_id: input.companyId,
    project_id: input.projectId,
    agent_id: input.agentId,
    task_id: input.taskId,
    goal_ancestry: input.goalAncestry,
    agent_role: input.agentRole,
    timestamp: new Date().toISOString(),
    run_id: input.runId,
    cost: input.costUsd ?? 0,
    memory_type: memoryType,
    visibility,
  };
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractErrorMemories(input: MemoryCaptureInput): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];

  if (input.outcome !== "failed" && input.outcome !== "timed_out") {
    return memories;
  }

  const parts: string[] = [];

  if (input.stderr) {
    const lines = input.stderr.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const relevant = lines.slice(-20).join("\n");
    if (relevant.length > 0) {
      parts.push(`Errors:\n${relevant}`);
    }
  }

  if (input.resultJson?.errorMessage) {
    parts.push(`Error: ${String(input.resultJson.errorMessage)}`);
  }

  if (input.toolCalls) {
    const failed = input.toolCalls.filter((tc) => tc.error);
    for (const f of failed) {
      parts.push(`Tool ${f.tool} failed: ${f.error}`);
    }
  }

  if (parts.length > 0) {
    memories.push({
      content: parts.join("\n\n"),
      memoryType: MemoryType.Error,
      visibility: MemoryVisibility.Shared,
    });
  }

  return memories;
}

function extractCodeChangeMemories(input: MemoryCaptureInput): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];

  const diffs = input.fileChanges ?? [];
  if (diffs.length === 0 && input.resultJson?.codeDiffs && Array.isArray(input.resultJson.codeDiffs)) {
    for (const cd of input.resultJson.codeDiffs as Array<{ path?: string; operation?: string; diff?: string }>) {
      const op = cd.operation ?? "modified";
      if (op === "created" || op === "modified" || op === "deleted") {
        diffs.push({ path: cd.path ?? "unknown", operation: op, diff: cd.diff });
      }
    }
  }

  if (diffs.length === 0) {
    return memories;
  }

  const lines = diffs
    .map((d) => {
      const op = d.operation ?? "modified";
      const patch = d.diff ? `\n${d.diff}` : "";
      return `- ${op}: ${d.path}${patch}`;
    })
    .join("\n");

  memories.push({
    content: `Code changes:\n${lines}`,
    memoryType: MemoryType.CodeChange,
    visibility: MemoryVisibility.Shared,
  });

  return memories;
}

function extractDecisionMemories(input: MemoryCaptureInput): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];

  // 1. Explicit resultSummary field
  if (input.resultJson?.resultSummary && typeof input.resultJson.resultSummary === "string") {
    const text = input.resultJson.resultSummary.trim();
    if (text.length > 20) {
      memories.push({
        content: `Decision: ${text}`,
        memoryType: MemoryType.Decision,
        visibility: MemoryVisibility.Shared,
      });
    }
  }

  // 2. Legacy summary field (used by tests)
  if (input.resultJson?.summary && typeof input.resultJson.summary === "string") {
    const text = input.resultJson.summary.trim();
    if (text.length > 20) {
      memories.push({
        content: `Decision: ${text}`,
        memoryType: MemoryType.Decision,
        visibility: MemoryVisibility.Shared,
      });
    }
  }

  // 3. Architecture field
  if (input.resultJson?.architecture && typeof input.resultJson.architecture === "string") {
    const text = input.resultJson.architecture.trim();
    if (text.length > 20) {
      memories.push({
        content: `Architecture: ${text}`,
        memoryType: MemoryType.Architecture,
        visibility: MemoryVisibility.Shared,
      });
    }
  }

  // 4. Keyword-based detection in resultSummary / summary
  const decisionKeywords = /\b(decided|decision|choose|chose|opted|selected|pick|picked|recommend|concluded|resolved)\b/i;
  const searchText =
    (typeof input.resultJson?.resultSummary === "string" ? input.resultJson.resultSummary : "") +
    (typeof input.resultJson?.summary === "string" ? ` ${input.resultJson.summary}` : "");

  if (decisionKeywords.test(searchText)) {
    // Only add if not already captured above
    const alreadyCaptured = memories.some((m) => m.memoryType === MemoryType.Decision);
    if (!alreadyCaptured && searchText.trim().length > 20) {
      memories.push({
        content: `Decision: ${searchText.trim()}`,
        memoryType: MemoryType.Decision,
        visibility: MemoryVisibility.Shared,
      });
    }
  }

  // 5. Tool calls — successful ones as decision memories
  if (input.toolCalls && input.toolCalls.length > 0) {
    const successful = input.toolCalls.filter((tc) => !tc.error);
    if (successful.length > 0) {
      const summary = successful
        .map((tc) => `- ${tc.tool}${tc.output ? `: ${JSON.stringify(tc.output).slice(0, 200)}` : ""}`)
        .join("\n");
      memories.push({
        content: `Tool calls:\n${summary}`,
        memoryType: MemoryType.Decision,
        visibility: MemoryVisibility.Shared,
      });
    }
  }

  // 6. Reasoning field
  if (input.reasoning && input.reasoning.trim().length > 20) {
    memories.push({
      content: `Reasoning: ${input.reasoning.trim()}`,
      memoryType: MemoryType.Decision,
      visibility: MemoryVisibility.Shared,
    });
  }

  return memories;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Legacy compatibility wrapper — converts the old flat input shape into the
 * new {@link RunDetails} shape and delegates to the primary implementation.
 * Preserves the full resultJson so architecture and other fields survive.
 */
export async function captureMemories(input: MemoryCaptureInput): Promise<MemoryCaptureResult> {
  if (!input.memoryService.enabled) {
    return { stored: 0, skipped: 1, errors: 0 };
  }

  const runDetails: RunDetails = {
    metadata: {
      companyId: input.companyId,
      projectId: input.projectId,
      agentId: input.agentId,
      agentRole: input.agentRole,
      goalAncestry: input.goalAncestry,
      runId: input.runId,
      cost: input.costUsd ?? 0,
    },
    artifacts: {
      toolCalls: input.toolCalls,
      resultSummary:
        (typeof input.resultJson?.resultSummary === "string"
          ? input.resultJson.resultSummary
          : undefined) ??
        (typeof input.resultJson?.summary === "string" ? input.resultJson.summary : undefined),
      stderr: input.stderr ?? undefined,
      codeDiffs: input.fileChanges,
    },
  };

  return captureRunMemories(runDetails, input.memoryService, input.resultJson ?? undefined);
}

/**
 * Primary implementation that accepts the canonical {@link RunDetails} shape.
 * The optional originalResultJson parameter carries fields (like architecture)
 * that don't fit into the simplified RunDetails.artifacts shape.
 */
export async function captureRunMemories(
  runDetails: RunDetails,
  memoryService: MemoryService,
  originalResultJson?: Record<string, unknown>,
): Promise<MemoryCaptureResult> {
  if (!memoryService.enabled) {
    return { stored: 0, skipped: 1, errors: 0 };
  }

  const taskId = runDetails.metadata.runId;
  const runId = runDetails.metadata.runId;

  const captureInput: MemoryCaptureInput = {
    memoryService,
    companyId: runDetails.metadata.companyId,
    projectId: runDetails.metadata.projectId,
    agentId: runDetails.metadata.agentId,
    agentRole: runDetails.metadata.agentRole,
    taskId,
    runId,
    goalAncestry: runDetails.metadata.goalAncestry,
    outcome: runDetails.artifacts.stderr ? "failed" : "succeeded",
    costUsd: runDetails.metadata.cost,
    stderr: runDetails.artifacts.stderr ?? null,
    toolCalls: runDetails.artifacts.toolCalls,
    resultJson: originalResultJson ?? (runDetails.artifacts.resultSummary
      ? { resultSummary: runDetails.artifacts.resultSummary }
      : null),
    fileChanges: runDetails.artifacts.codeDiffs,
  };

  const allMemories: ExtractedMemory[] = [
    ...extractDecisionMemories(captureInput),
    ...extractErrorMemories(captureInput),
    ...extractCodeChangeMemories(captureInput),
  ];

  if (allMemories.length === 0) {
    return { stored: 0, skipped: 1, errors: 0 };
  }

  let stored = 0;
  let errors = 0;

  for (const memory of allMemories) {
    try {
      const metadata = buildMetadata(captureInput, memory.memoryType, memory.visibility);

      const result = await memoryService.store({
        content: memory.content,
        metadata,
        visibility: memory.visibility,
        companyId: captureInput.companyId,
        projectId: captureInput.projectId,
        agentId: captureInput.agentId,
      });

      if (result) {
        stored++;
      } else {
        errors++;
      }
    } catch (err) {
      logger.warn({ err, runId: captureInput.runId }, "Memory capture store failed");
      errors++;
    }
  }

  // Auto-compression / consolidation
  try {
    await triggerConsolidation(memoryService, captureInput.companyId, captureInput.projectId);
  } catch (err) {
    logger.warn({ err, runId: captureInput.runId }, "Memory consolidation trigger failed");
  }

  if (stored > 0) {
    logger.info(
      { runId: captureInput.runId, stored, errors, agentId: captureInput.agentId },
      "[MemoryCapture] Stored run memories",
    );
  }

  return { stored, skipped: 0, errors };
}
