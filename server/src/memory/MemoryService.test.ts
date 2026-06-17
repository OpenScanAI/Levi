import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as Namespace from "./MemoryNamespace.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import { createMemoryService } from "./MemoryService.js";

const baseMetadata = {
  company_id: "acme",
  project_id: "api-v2",
  agent_id: "backend-agent",
  task_id: "task-1",
  goal_ancestry: ["goal-1"],
  agent_role: "backend",
  timestamp: "2026-05-26T00:00:00.000Z",
  run_id: "run-1",
  cost: 1.25,
  memory_type: MemoryType.Decision,
  visibility: MemoryVisibility.Shared,
};

const makeMetadata = (overrides: Partial<typeof baseMetadata> = {}) => ({
  ...baseMetadata,
  ...overrides,
});

const toResponse = (data: unknown, ok = true) =>
  ({
    ok,
    json: async () => data,
  }) as Response;

describe("MemoryNamespace", () => {
  it("builds company, project, and agent namespaces", () => {
    expect(Namespace.forCompany("acme")).toBe("levi:acme");
    expect(Namespace.forProject("acme", "api-v2")).toBe("levi:acme:api-v2");
    expect(Namespace.forAgent("acme", "api-v2", "backend-agent")).toBe("levi:acme:api-v2:backend-agent");
  });

  it("sanitizes special characters", () => {
    expect(Namespace.forCompany(" acme!! ")).toBe("levi:acme");
    expect(Namespace.forProject("acme", "api@@v2")).toBe("levi:acme:api_v2");
    expect(Namespace.forAgent("acme", "api-v2", "backend agent")).toBe("levi:acme:api-v2:backend_agent");
  });

  it("throws on empty ids", () => {
    expect(() => Namespace.forCompany(" ")).toThrow();
    expect(() => Namespace.forProject("acme", "")).toThrow();
    expect(() => Namespace.forAgent("acme", "api", " ")).toThrow();
  });

  it("parses namespaces round-trip", () => {
    const namespace = Namespace.forAgent("acme", "api-v2", "backend-agent");
    expect(Namespace.parseNamespace(namespace)).toEqual({
      prefix: "levi",
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });
  });
});

describe("MemoryNamespace cross-company isolation", () => {
  it("guards company prefixes", () => {
    const namespace = Namespace.forProject("acme", "alpha");
    expect(Namespace.namespaceIsForCompany(namespace, "globex")).toBe(false);
    expect(() => Namespace.assertNamespaceBelongsToCompany(namespace, "globex")).toThrow();
    expect(() => Namespace.assertNamespaceBelongsToCompany(namespace, "acme")).not.toThrow();
  });

  it("keeps project namespaces distinct", () => {
    expect(Namespace.forProject("acme", "alpha")).not.toBe(Namespace.forProject("acme", "beta"));
  });

  it("keeps agent namespaces distinct", () => {
    expect(Namespace.forAgent("acme", "alpha", "agent-1")).not.toBe(
      Namespace.forAgent("acme", "alpha", "agent-2"),
    );
  });
});

describe("MemoryService (disabled)", () => {
  it("returns safe defaults when disabled", async () => {
    const service = createMemoryService({ enabled: false });
    await expect(service.isHealthy()).resolves.toBe(false);
    await expect(
      service.store({
        content: "note",
        metadata: makeMetadata(),
        companyId: "acme",
        projectId: "api-v2",
        agentId: "backend-agent",
      }),
    ).resolves.toBeNull();
    await expect(
      service.query({
        query: "release",
        company_id: "acme",
        project_id: "api-v2",
        agent_id: "backend-agent",
        agent_role: "backend",
      }),
    ).resolves.toEqual([]);
  });
});

describe("MemoryService (mocked fetch)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let searchResults: unknown[] = [];

  beforeEach(() => {
    searchResults = [];
    fetchMock = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/health")) {
        return toResponse({ status: "ok" });
      }
      if (target.endsWith("/observations")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return toResponse({ id: "mem-1", confidence: 0.9, ...body });
      }
      if (target.endsWith("/observations/search")) {
        return toResponse({ observations: searchResults });
      }
      if (target.includes("/namespaces/")) {
        return toResponse({});
      }
      return toResponse({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("store() writes to agent-scoped namespace", async () => {
    const service = createMemoryService({ enabled: true });
    await service.store({
      content: "Saved decision",
      metadata: makeMetadata(),
      companyId: "acme",
      projectId: "api-v2",
      agentId: "backend-agent",
    });

    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).endsWith("/observations"));
    const body = JSON.parse(String(call?.[1]?.body ?? "{}")) as { namespace?: string };
    expect(body.namespace).toBe("levi:acme:api-v2:backend-agent");
  });

  it("query() returns only visible memories", async () => {
    const service = createMemoryService({ enabled: true });

    searchResults = [
      {
        id: "mem-shared",
        content: "Shared insight",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.Shared }),
      },
      {
        id: "mem-role",
        content: "Backend-only insight",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.RolePrivate, agent_role: "backend" }),
      },
      {
        id: "mem-role-other",
        content: "Frontend-only insight",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.RolePrivate, agent_role: "frontend" }),
      },
      {
        id: "mem-agent",
        content: "Agent private",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.AgentPrivate, agent_id: "agent-1" }),
      },
      {
        id: "mem-agent-other",
        content: "Other agent private",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.AgentPrivate, agent_id: "agent-2" }),
      },
      {
        id: "mem-ceo",
        content: "CEO-only insight",
        namespace: "levi:acme:api-v2",
        confidence: 0.9,
        metadata: makeMetadata({ visibility: MemoryVisibility.CeoOnly, agent_role: "ceo" }),
      },
    ];

    const results = await service.query({
      query: "roadmap",
      company_id: "acme",
      project_id: "api-v2",
      agent_id: "agent-1",
      agent_role: "backend",
    });

    const ids = results.map((result) => result.id);
    expect(ids).toEqual(["mem-shared", "mem-role", "mem-agent"]);

    const searchCall = fetchMock.mock.calls.find((entry) => String(entry[0]).endsWith("/observations/search"));
    const body = JSON.parse(String(searchCall?.[1]?.body ?? "{}")) as { namespace?: string };
    expect(body.namespace).toBe("levi:acme:api-v2");
  });

  it("purgeCompany() targets company namespace", async () => {
    const service = createMemoryService({ enabled: true });
    await service.purgeCompany("acme");

    const deleteCall = fetchMock.mock.calls.find((entry) => String(entry[0]).includes("/namespaces/"));
    expect(String(deleteCall?.[0])).toBe(
      `http://localhost:3111/namespaces/${encodeURIComponent("levi:acme")}`,
    );
  });

  it("purgeProject() targets the project namespace", async () => {
    const service = createMemoryService({ enabled: true });
    await service.purgeProject("acme", "project-alpha");

    const deleteCall = fetchMock.mock.calls.find((entry) => String(entry[0]).includes("/namespaces/"));
    const target = String(deleteCall?.[0]);
    expect(target).toContain(encodeURIComponent("levi:acme:project-alpha"));
    expect(target).not.toContain(encodeURIComponent("levi:acme:project-beta"));
  });
});
