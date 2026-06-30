import { describe, expect, it } from "vitest";
import type { agents } from "@paperclipai/db";
import {
  parseSessionCompactionPolicy,
  evaluateSessionCompactionFromRuns,
  type SessionCompactionDecision,
} from "../services/heartbeat.ts";

function buildAgent(adapterType: string, runtimeConfig: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    companyId: "company-1",
    projectId: null,
    goalId: null,
    name: "Agent",
    role: "engineer",
    title: null,
    icon: null,
    status: "running",
    reportsTo: null,
    capabilities: null,
    adapterType,
    adapterConfig: {},
    runtimeConfig,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    permissions: {},
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof agents.$inferSelect;
}

function buildRun(overrides: {
  id?: string;
  createdAt?: Date;
  resultJson?: Record<string, unknown> | null;
  errorCode?: string | null;
  error?: string | null;
} = {}) {
  return {
    id: overrides.id ?? "run-1",
    createdAt: overrides.createdAt ?? new Date("2026-06-30T12:00:00.000Z"),
    usageJson: null,
    error: overrides.error ?? null,
    resultSummary: null,
    resultResult: null,
    resultMessage: null,
    resultError: null,
    resultTotalCostUsd: null,
    resultCostUsd: null,
    resultCostUsdCamel: null,
    resultJson: overrides.resultJson ?? null,
    errorCode: overrides.errorCode ?? null,
  };
}

describe("parseSessionCompactionPolicy maxConsecutiveAdapterFailed", () => {
  it("defaults claude_local to 2 consecutive adapter_failed rotations", () => {
    expect(parseSessionCompactionPolicy(buildAgent("claude_local"))).toMatchObject({
      maxConsecutiveAdapterFailed: 2,
    });
  });

  it("defaults other adapters to 0", () => {
    expect(parseSessionCompactionPolicy(buildAgent("codex_local"))).toMatchObject({
      maxConsecutiveAdapterFailed: 0,
    });
    expect(parseSessionCompactionPolicy(buildAgent("cursor"))).toMatchObject({
      maxConsecutiveAdapterFailed: 0,
    });
  });

  it("allows agent runtime config override", () => {
    expect(
      parseSessionCompactionPolicy(
        buildAgent("claude_local", {
          heartbeat: {
            sessionCompaction: {
              maxConsecutiveAdapterFailed: 5,
            },
          },
        }),
      ),
    ).toMatchObject({
      maxConsecutiveAdapterFailed: 5,
    });
  });
});

function evaluateFromRuns(
  agent: ReturnType<typeof buildAgent>,
  runs: ReturnType<typeof buildRun>[],
): SessionCompactionDecision {
  const policy = parseSessionCompactionPolicy(agent);
  return evaluateSessionCompactionFromRuns({
    agent,
    sessionId: "session-1",
    issueId: "issue-1",
    policy,
    runs,
    oldestRun: runs[runs.length - 1] ?? null,
  });
}

describe("evaluateSessionCompaction consecutive adapter_failed rule", () => {
  it("does not rotate when threshold is 0", () => {
    const agent = buildAgent("codex_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
    ]);
    expect(decision.rotate).toBe(false);
  });

  it("does not rotate when there are fewer consecutive adapter_failed runs than threshold", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
    ]);
    expect(decision.rotate).toBe(false);
  });

  it("rotates when 2 consecutive adapter_failed runs occur for claude_local", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({
        id: "run-2",
        createdAt: new Date("2026-06-30T12:01:00.000Z"),
        resultJson: { stopReason: "adapter_failed" },
        errorCode: "adapter_failed",
      }),
      buildRun({
        id: "run-1",
        createdAt: new Date("2026-06-30T12:00:00.000Z"),
        resultJson: { stopReason: "adapter_failed" },
        errorCode: "adapter_failed",
      }),
    ]);
    expect(decision.rotate).toBe(true);
    expect(decision.reason).toContain("2 consecutive adapter_failed");
    expect(decision.previousRunId).toBe("run-2");
  });

  it("rotates when consecutive runs include transient_upstream error family", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({
        resultJson: { stopReason: "adapter_failed", errorFamily: "transient_upstream" },
        errorCode: "claude_transient_upstream",
      }),
      buildRun({
        resultJson: { stopReason: "adapter_failed", errorFamily: "transient_upstream" },
        errorCode: "claude_transient_upstream",
      }),
    ]);
    expect(decision.rotate).toBe(true);
  });

  it("stops counting at the first non-adapter-failed run", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
      buildRun({ resultJson: { stopReason: "completed" }, errorCode: null }),
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
    ]);
    expect(decision.rotate).toBe(false);
  });

  it("does not rotate when the latest run succeeded", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({ resultJson: { stopReason: "completed" }, errorCode: null }),
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
      buildRun({ resultJson: { stopReason: "adapter_failed" }, errorCode: "adapter_failed" }),
    ]);
    expect(decision.rotate).toBe(false);
  });

  it("falls back to errorCode when stopReason is missing", () => {
    const agent = buildAgent("claude_local");
    const decision = evaluateFromRuns(agent, [
      buildRun({ resultJson: {}, errorCode: "adapter_failed" }),
      buildRun({ resultJson: {}, errorCode: "adapter_failed" }),
    ]);
    expect(decision.rotate).toBe(true);
  });
});
