import { describe, expect, it } from "vitest";
import { resolveNoContextBlock } from "../services/heartbeat.js";

const baseAgent = { runtimeConfig: {} } as any;

describe("resolveNoContextBlock", () => {
  it("returns no block when the agent has an issue context", () => {
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: { issueId: "issue-1" },
      source: "timer",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(false);
  });

  it("returns no block when the agent has a task key", () => {
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: { taskKey: "task-1" },
      source: "timer",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(false);
  });

  it("returns no block when resuming from an existing run", () => {
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: { resumeFromRunId: "run-1" },
      source: "timer",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(false);
  });

  it("returns no block for explicit non-timer wakes", () => {
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: {},
      source: "on_demand",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(false);
  });

  it("returns NO_CONTEXT when timer wakes have no context", () => {
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: {},
      source: "timer",
      reason: null,
    });
    expect(result.block).toEqual({
      reason: "Run started with no loaded context (no issue, task, or resume session).",
      code: "NO_CONTEXT",
    });
    expect(result.overrideUsed).toBe(false);
  });

  it("returns no block when the agent opts out via runtimeConfig", () => {
    const agent = { runtimeConfig: { budgets: { allowNoContextRuns: true } } } as any;
    const result = resolveNoContextBlock({
      agent,
      contextSnapshot: {},
      source: "timer",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(true);
  });

  it("returns no block when the instance opts out via env var", () => {
    process.env.LEVI_ALLOW_NO_CONTEXT_RUNS = "1";
    const result = resolveNoContextBlock({
      agent: baseAgent,
      contextSnapshot: {},
      source: "timer",
      reason: null,
    });
    expect(result.block).toBeNull();
    expect(result.overrideUsed).toBe(true);
    delete process.env.LEVI_ALLOW_NO_CONTEXT_RUNS;
  });
});
