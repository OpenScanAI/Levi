import { describe, expect, it, vi } from "vitest";
import { captureMemories } from "./MemoryCapture.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { MemoryService } from "./MemoryService.js";

function makeMockMemoryService(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    enabled: true,
    isHealthy: vi.fn().mockResolvedValue(true),
    store: vi.fn().mockImplementation(async (input) => ({
      id: "mem-1",
      content: input.content,
      metadata: input.metadata,
      namespace: "levi:company-1:project-1:agent-1",
      confidence: 0.9,
    })),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    purgeCompany: vi.fn().mockResolvedValue(undefined),
    purgeProject: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
    ...overrides,
  };
}

function makeCaptureInput(overrides: Partial<Parameters<typeof captureMemories>[0]> = {}) {
  return {
    memoryService: makeMockMemoryService(),
    companyId: "company-1",
    projectId: "project-1",
    agentId: "agent-1",
    agentRole: "backend_engineer",
    taskId: "task-1",
    runId: "run-1",
    goalAncestry: ["mission-1", "goal-1"],
    outcome: "succeeded" as const,
    ...overrides,
  };
}

describe("captureMemories", () => {
  it("skips when memory service is disabled", async () => {
    const memoryService = makeMockMemoryService({ enabled: false });
    const result = await captureMemories(makeCaptureInput({ memoryService }));

    expect(result.stored).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(memoryService.store).not.toHaveBeenCalled();
  });

  it("skips when no extractable memories exist", async () => {
    const result = await captureMemories(makeCaptureInput());

    expect(result.stored).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("extracts decision memories from resultJson summary", async () => {
    const memoryService = makeMockMemoryService();
    const result = await captureMemories(
      makeCaptureInput({
        memoryService,
        resultJson: { summary: "We decided to use PostgreSQL over MySQL for ACID compliance" },
      }),
    );

    expect(result.stored).toBeGreaterThanOrEqual(1);
    expect(memoryService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("PostgreSQL"),
        metadata: expect.objectContaining({
          memory_type: MemoryType.Decision,
          visibility: MemoryVisibility.Shared,
        }),
      }),
    );
  });

  it("extracts error memories from failed runs", async () => {
    const memoryService = makeMockMemoryService();
    const result = await captureMemories(
      makeCaptureInput({
        memoryService,
        outcome: "failed",
        stderr: "Error: Connection refused at port 5432\nStack trace...",
        resultJson: { errorMessage: "Database connection failed" },
      }),
    );

    expect(result.stored).toBeGreaterThanOrEqual(1);
    expect(memoryService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Connection refused"),
        metadata: expect.objectContaining({
          memory_type: MemoryType.Error,
        }),
      }),
    );
  });

  it("extracts code change memories from fileChanges", async () => {
    const memoryService = makeMockMemoryService();
    const result = await captureMemories(
      makeCaptureInput({
        memoryService,
        fileChanges: [
          { path: "src/db.ts", operation: "modified", diff: "+import pg from 'pg'" },
          { path: "src/config.ts", operation: "modified" },
        ],
      }),
    );

    expect(result.stored).toBeGreaterThanOrEqual(1);
    expect(memoryService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("src/db.ts"),
        metadata: expect.objectContaining({
          memory_type: MemoryType.CodeChange,
        }),
      }),
    );
  });

  it("extracts architecture memories from resultJson", async () => {
    const memoryService = makeMockMemoryService();
    const result = await captureMemories(
      makeCaptureInput({
        memoryService,
        resultJson: {
          architecture: "We adopted a microservices pattern with event-driven communication via RabbitMQ and this is definitely long enough to pass threshold",
        },
      }),
    );

    expect(result.stored).toBeGreaterThanOrEqual(1);
    expect(memoryService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("microservices"),
        metadata: expect.objectContaining({
          memory_type: MemoryType.Architecture,
        }),
      }),
    );
  });

  it("includes correct metadata for all stored memories", async () => {
    const memoryService = makeMockMemoryService();
    const result = await captureMemories(
      makeCaptureInput({
        memoryService,
        resultJson: { summary: "Test decision with enough length to pass the threshold check" },
        outcome: "succeeded",
        costUsd: 0.05,
      }),
    );

    expect(result.stored).toBeGreaterThan(0);
    const storeCalls = (memoryService.store as ReturnType<typeof vi.fn>).mock.calls;
    expect(storeCalls.length).toBeGreaterThan(0);
    const storeCall = storeCalls[0][0];
    expect(storeCall.metadata).toMatchObject({
      company_id: "company-1",
      project_id: "project-1",
      agent_id: "agent-1",
      run_id: "run-1",
      agent_role: "backend_engineer",
      goal_ancestry: ["mission-1", "goal-1"],
      cost: 0.05,
    });
    expect(storeCall.metadata.timestamp).toBeDefined();
  });
});
