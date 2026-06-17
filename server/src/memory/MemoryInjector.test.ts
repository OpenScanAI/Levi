import { describe, expect, it, vi } from "vitest";
import { injectMemories } from "./MemoryInjector.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { MemoryService } from "./MemoryService.js";
import type { RetrievedMemory } from "./MemoryTypes.js";

const baseMetadata = {
  company_id: "acme",
  project_id: "api",
  agent_id: "agent-1",
  task_id: "task-1",
  goal_ancestry: ["goal-1"],
  agent_role: "backend",
  timestamp: "2026-05-26T00:00:00.000Z",
  run_id: "run-1",
  cost: 0.5,
  memory_type: MemoryType.Decision,
  visibility: MemoryVisibility.Shared,
};

function buildMemory(overrides: Partial<RetrievedMemory> = {}): RetrievedMemory {
  return {
    id: "mem-1",
    content: "Use cache",
    metadata: baseMetadata,
    namespace: "levi:acme:api",
    confidence: 0.91,
    ...overrides,
  };
}

function buildService(result: RetrievedMemory[] | Error): MemoryService {
  const query = vi.fn().mockImplementation(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return {
    enabled: true,
    query,
  } as unknown as MemoryService;
}

describe("injectMemories", () => {
  it("returns skipped when memory service disabled", async () => {
    const result = await injectMemories({
      memoryService: { enabled: false } as MemoryService,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
    });

    expect(result.skipped).toBe(true);
    expect(result.contextBlock).toBe("");
    expect(result.memories).toEqual([]);
    expect(result.tokenCount).toBe(0);
  });

  it("returns skipped when no memories found", async () => {
    const service = buildService([]);
    const result = await injectMemories({
      memoryService: service,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
    });

    expect(result.skipped).toBe(true);
    expect(result.contextBlock).toBe("");
  });

  it("formats contextBlock with metadata", async () => {
    const memory = buildMemory({
      content: "Use cache",
      metadata: { ...baseMetadata, memory_type: MemoryType.Decision },
      confidence: 0.91,
    });
    const service = buildService([memory]);

    const result = await injectMemories({
      memoryService: service,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
    });

    expect(result.contextBlock).toBe(
      "[1] (decision) Use cache\n    Agent: agent-1 | Task: task-1 | Confidence: 0.91",
    );
  });

  it("respects memoryBudget and slices memories", async () => {
    const memories = [
      buildMemory({ id: "mem-1", content: "abcd" }),
      buildMemory({ id: "mem-2", content: "efgh" }),
      buildMemory({ id: "mem-3", content: "ijkl" }),
    ];
    const service = buildService(memories);

    const result = await injectMemories({
      memoryService: service,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
      memoryBudget: 2,
    });

    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-1", "mem-2"]);
    expect(result.tokenCount).toBe(2);
  });

  it("returns skipped on query error without throwing", async () => {
    const service = buildService(new Error("boom"));

    const result = await injectMemories({
      memoryService: service,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
    });

    expect(result.skipped).toBe(true);
  });

  it("estimates tokens as 4 chars per token", async () => {
    const memory = buildMemory({ content: "1234567" });
    const service = buildService([memory]);

    const result = await injectMemories({
      memoryService: service,
      companyId: "acme",
      projectId: "api",
      agentId: "agent-1",
      agentRole: "backend",
      taskDescription: "task",
    });

    expect(result.tokenCount).toBe(2);
  });
});
