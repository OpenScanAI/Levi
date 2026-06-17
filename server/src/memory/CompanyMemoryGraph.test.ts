import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CompanyMemoryGraph, getCompanyMemoryGraph, resetCompanyMemoryGraph } from "./CompanyMemoryGraph.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { MemoryService } from "./MemoryService.js";
import type { RetrievedMemory, MemoryMetadata } from "./MemoryTypes.js";
import * as LiveEvents from "../services/live-events.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn().mockReturnValue({ id: 1 }),
}));

const baseMetadata: MemoryMetadata = {
  company_id: "acme",
  project_id: "api-v2",
  agent_id: "backend-agent",
  task_id: "task-1",
  goal_ancestry: ["goal-1"],
  agent_role: "backend",
  timestamp: new Date().toISOString(),
  run_id: "run-1",
  cost: 1.25,
  memory_type: MemoryType.Decision,
  visibility: MemoryVisibility.Shared,
};

function makeMetadata(overrides: Partial<MemoryMetadata> = {}): MemoryMetadata {
  return { ...baseMetadata, ...overrides };
}

function makeRetrievedMemory(
  overrides: Partial<RetrievedMemory> & { metadata?: Partial<MemoryMetadata> } = {},
): RetrievedMemory {
  const metadata: MemoryMetadata = { ...baseMetadata, ...(overrides.metadata ?? {}) };
  const { metadata: _discard, ...restOverrides } = overrides;
  return {
    id: "mem-1",
    content: "Test memory content",
    namespace: "levi:acme:api-v2",
    confidence: 0.85,
    relevanceScore: 0.9,
    ...restOverrides,
    metadata,
  };
}

function makeMockMemoryService(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    enabled: true,
    isHealthy: vi.fn().mockResolvedValue(true),
    store: vi.fn().mockImplementation(async (input) => ({
      id: "mem-stored",
      content: input.content,
      metadata: input.metadata,
      namespace: "levi:acme:api-v2:backend-agent",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompanyMemoryGraph", () => {
  beforeEach(() => {
    resetCompanyMemoryGraph();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // querySharedBrain — basic behaviour
  // -------------------------------------------------------------------------

  it("returns empty array when memory service is disabled", async () => {
    const service = makeMockMemoryService({ enabled: false });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");

    expect(results).toEqual([]);
    expect(service.query).not.toHaveBeenCalled();
  });

  it("returns empty array when missing required parameters", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    const missingCompany = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "");
    const missingProject = await graph.querySharedBrain("", "auth", { agentId: "a1", role: "backend" }, "acme");
    const missingQuery = await graph.querySharedBrain("api-v2", "", { agentId: "a1", role: "backend" }, "acme");

    expect(missingCompany).toEqual([]);
    expect(missingProject).toEqual([]);
    expect(missingQuery).toEqual([]);
    expect(service.query).not.toHaveBeenCalled();
  });

  it("returns empty array when query returns no memories", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");

    expect(results).toEqual([]);
    expect(service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "auth",
        company_id: "acme",
        project_id: "api-v2",
        agent_id: "a1",
        agent_role: "backend",
        topK: 20,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Privacy filters
  // -------------------------------------------------------------------------

  it("includes shared memories for any agent", async () => {
    const sharedMemory = makeRetrievedMemory({
      id: "mem-shared",
      content: "Shared insight",
      metadata: makeMetadata({ visibility: MemoryVisibility.Shared, agent_id: "any-agent", agent_role: "any-role" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([sharedMemory]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "frontend" }, "acme");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("mem-shared");
  });

  it("filters agent_private to the authoring agent only", async () => {
    const ownPrivate = makeRetrievedMemory({
      id: "mem-own",
      content: "My private note",
      metadata: makeMetadata({ visibility: MemoryVisibility.AgentPrivate, agent_id: "agent-1", agent_role: "backend" }),
    });
    const otherPrivate = makeRetrievedMemory({
      id: "mem-other",
      content: "Another agent's note",
      metadata: makeMetadata({ visibility: MemoryVisibility.AgentPrivate, agent_id: "agent-2", agent_role: "frontend" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([ownPrivate, otherPrivate]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "agent-1", role: "backend" }, "acme");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("mem-own");
  });

  it("filters role_private to same-role agents only", async () => {
    const sameRole = makeRetrievedMemory({
      id: "mem-same-role",
      content: "Backend pattern",
      metadata: makeMetadata({ visibility: MemoryVisibility.RolePrivate, agent_role: "backend", agent_id: "agent-1" }),
    });
    const diffRole = makeRetrievedMemory({
      id: "mem-diff-role",
      content: "Frontend pattern",
      metadata: makeMetadata({ visibility: MemoryVisibility.RolePrivate, agent_role: "frontend", agent_id: "agent-2" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([sameRole, diffRole]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "agent-1", role: "backend" }, "acme");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("mem-same-role");
  });

  it("filters ceo_only to CEO and Management roles", async () => {
    const ceoMemory = makeRetrievedMemory({
      id: "mem-ceo",
      content: "Strategic decision",
      metadata: makeMetadata({ visibility: MemoryVisibility.CeoOnly, agent_role: "ceo", agent_id: "ceo-agent" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([ceoMemory]),
    });
    const graph = new CompanyMemoryGraph(service);

    // CEO can see it
    const ceoResults = await graph.querySharedBrain("api-v2", "auth", { agentId: "ceo-1", role: "CEO" }, "acme");
    expect(ceoResults).toHaveLength(1);

    // Management can see it
    const mgmtResults = await graph.querySharedBrain("api-v2", "auth", { agentId: "mgr-1", role: "Management" }, "acme");
    expect(mgmtResults).toHaveLength(1);

    // CTO can see it (treated as management)
    const ctoResults = await graph.querySharedBrain("api-v2", "auth", { agentId: "cto-1", role: "CTO" }, "acme");
    expect(ctoResults).toHaveLength(1);

    // Regular engineer cannot see it
    const engResults = await graph.querySharedBrain("api-v2", "auth", { agentId: "eng-1", role: "engineer" }, "acme");
    expect(engResults).toHaveLength(0);
  });

  it("hides memories with unknown visibility by default", async () => {
    const unknownVis = makeRetrievedMemory({
      id: "mem-unknown",
      content: "Mystery memory",
      metadata: makeMetadata({ visibility: "unknown_visibility" as MemoryVisibility, agent_id: "unknown-agent", agent_role: "unknown-role" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([unknownVis]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");
    expect(results).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Ranking algorithm
  // -------------------------------------------------------------------------

  it("ranks higher-confidence memories above lower-confidence ones", async () => {
    const lowConfidence = makeRetrievedMemory({
      id: "mem-low",
      content: "Low relevance",
      confidence: 0.3,
      relevanceScore: 0.2,
      metadata: makeMetadata({ visibility: MemoryVisibility.Shared, agent_id: "agent-1", agent_role: "backend" }),
    });
    const highConfidence = makeRetrievedMemory({
      id: "mem-high",
      content: "High relevance",
      confidence: 0.95,
      relevanceScore: 0.92,
      metadata: makeMetadata({ visibility: MemoryVisibility.Shared, agent_id: "agent-2", agent_role: "backend" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([lowConfidence, highConfidence]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");

    expect(results[0].id).toBe("mem-high");
    expect(results[1].id).toBe("mem-low");
  });

  it("boosts same-role memories in ranking", async () => {
    const sameRoleLowConfidence = makeRetrievedMemory({
      id: "mem-same-role-low",
      content: "Same role, lower confidence",
      confidence: 0.5,
      relevanceScore: 0.5,
      metadata: makeMetadata({ visibility: MemoryVisibility.Shared, agent_role: "backend", agent_id: "agent-1" }),
    });
    const diffRoleHighConfidence = makeRetrievedMemory({
      id: "mem-diff-role-high",
      content: "Different role, higher confidence",
      confidence: 0.7,
      relevanceScore: 0.7,
      metadata: makeMetadata({ visibility: MemoryVisibility.Shared, agent_role: "frontend", agent_id: "agent-2" }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([sameRoleLowConfidence, diffRoleHighConfidence]),
    });
    const graph = new CompanyMemoryGraph(service);

    // Requesting agent is backend — same-role memory should get a boost
    // that may push it above the diff-role memory despite lower base score.
    // Base: 0.5 vs 0.7.  Same-role adds +0.25 → 0.75 vs 0.7.
    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");

    expect(results[0].id).toBe("mem-same-role-low");
    expect(results[1].id).toBe("mem-diff-role-high");
  });

  it("boosts newer memories in ranking", async () => {
    const oldMemory = makeRetrievedMemory({
      id: "mem-old",
      content: "Old memory",
      confidence: 0.8,
      relevanceScore: 0.8,
      metadata: makeMetadata({
        visibility: MemoryVisibility.Shared,
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
        agent_id: "agent-1",
        agent_role: "backend",
      }),
    });
    const newMemory = makeRetrievedMemory({
      id: "mem-new",
      content: "New memory",
      confidence: 0.8,
      relevanceScore: 0.8,
      metadata: makeMetadata({
        visibility: MemoryVisibility.Shared,
        timestamp: new Date().toISOString(), // fresh
        agent_id: "agent-2",
        agent_role: "backend",
      }),
    });

    const service = makeMockMemoryService({
      query: vi.fn().mockResolvedValue([oldMemory, newMemory]),
    });
    const graph = new CompanyMemoryGraph(service);

    const results = await graph.querySharedBrain("api-v2", "auth", { agentId: "a1", role: "backend" }, "acme");

    expect(results[0].id).toBe("mem-new");
    expect(results[1].id).toBe("mem-old");
  });

  // -------------------------------------------------------------------------
  // storeAndBroadcast
  // -------------------------------------------------------------------------

  it("stores a memory successfully", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    const result = await graph.storeAndBroadcast({
      content: "Important decision",
      metadata: makeMetadata({ memory_type: MemoryType.Decision }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(result).not.toBeNull();
    expect(result?.content).toBe("Important decision");
    expect(service.store).toHaveBeenCalledTimes(1);
  });

  it("returns null when store fails", async () => {
    const service = makeMockMemoryService({
      store: vi.fn().mockResolvedValue(null),
    });
    const graph = new CompanyMemoryGraph(service);

    const result = await graph.storeAndBroadcast({
      content: "Important decision",
      metadata: makeMetadata(),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(result).toBeNull();
  });

  it("broadcasts for architecture memories", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    await graph.storeAndBroadcast({
      content: "We adopted microservices",
      metadata: makeMetadata({ memory_type: MemoryType.Architecture }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(LiveEvents.publishLiveEvent).toHaveBeenCalledTimes(1);
    const call = (LiveEvents.publishLiveEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.type).toBe("activity.logged");
    expect(call.payload.memoryType).toBe(MemoryType.Architecture);
  });

  it("broadcasts for code_change memories", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    await graph.storeAndBroadcast({
      content: "Refactored auth module",
      metadata: makeMetadata({ memory_type: MemoryType.CodeChange }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(LiveEvents.publishLiveEvent).toHaveBeenCalledTimes(1);
    const call = (LiveEvents.publishLiveEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.payload.memoryType).toBe(MemoryType.CodeChange);
  });

  it("broadcasts for breaking-change architecture memories", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    await graph.storeAndBroadcast({
      content: "BREAKING CHANGE: removed legacy auth endpoint",
      metadata: makeMetadata({ memory_type: MemoryType.Architecture }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(LiveEvents.publishLiveEvent).toHaveBeenCalledTimes(1);
  });

  it("does not broadcast for regular decision memories", async () => {
    const service = makeMockMemoryService();
    const graph = new CompanyMemoryGraph(service);

    await graph.storeAndBroadcast({
      content: "We decided to use PostgreSQL",
      metadata: makeMetadata({ memory_type: MemoryType.Decision }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(LiveEvents.publishLiveEvent).not.toHaveBeenCalled();
  });

  it("does not fail store when broadcast throws", async () => {
    const service = makeMockMemoryService();
    vi.mocked(LiveEvents.publishLiveEvent).mockImplementation(() => {
      throw new Error("Broadcast failed");
    });

    const graph = new CompanyMemoryGraph(service);

    const result = await graph.storeAndBroadcast({
      content: "Breaking change: removed v1 API",
      metadata: makeMetadata({ memory_type: MemoryType.Architecture }),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(result).not.toBeNull();
    expect(service.store).toHaveBeenCalledTimes(1);
  });

  it("returns null when memory service is disabled", async () => {
    const service = makeMockMemoryService({ enabled: false });
    const graph = new CompanyMemoryGraph(service);

    const result = await graph.storeAndBroadcast({
      content: "Important decision",
      metadata: makeMetadata(),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    expect(result).toBeNull();
    expect(service.store).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Singleton helpers
  // -------------------------------------------------------------------------

  it("getCompanyMemoryGraph returns the same instance", () => {
    const service = makeMockMemoryService();
    const g1 = getCompanyMemoryGraph(service);
    const g2 = getCompanyMemoryGraph(service);
    expect(g1).toBe(g2);
  });

  it("resetCompanyMemoryGraph clears the singleton", () => {
    const service = makeMockMemoryService();
    const g1 = getCompanyMemoryGraph(service);
    resetCompanyMemoryGraph();
    const g2 = getCompanyMemoryGraph(service);
    expect(g1).not.toBe(g2);
  });
});
