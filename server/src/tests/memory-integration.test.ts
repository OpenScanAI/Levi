import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { createMemoryService } from "../memory/MemoryService.js";
import type { MemoryService } from "../memory/MemoryService.js";
import { MemoryType, MemoryVisibility } from "../memory/MemoryTypes.js";
import { createAgentMemoryMockApp, resetMockObservations } from "./agentmemory-mock.js";

describe("MemoryService integration with mock agentmemory", () => {
  let mockServer: Server;
  let memoryService: MemoryService;
  const MOCK_PORT = 3111;
  const MOCK_BASE_URL = `http://localhost:${MOCK_PORT}`;

  beforeAll(async () => {
    resetMockObservations();
    const app = createAgentMemoryMockApp();
    mockServer = createServer(app);
    await new Promise<void>((resolve) => mockServer.listen(MOCK_PORT, resolve));

    memoryService = createMemoryService({
      enabled: true,
      baseUrl: MOCK_BASE_URL,
      autoStart: false,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("health check passes when mock is running", async () => {
    const healthy = await memoryService.isHealthy();
    expect(healthy).toBe(true);
  });

  it("store() writes an observation to the mock", async () => {
    const result = await memoryService.store({
      companyId: "comp-1",
      projectId: "proj-1",
      agentId: "agent-1",
      content: "Implemented JWT authentication",
      metadata: {
        company_id: "comp-1",
        project_id: "proj-1",
        agent_id: "agent-1",
        task_id: "task-1",
        goal_ancestry: [],
        agent_role: "Backend Engineer",
        timestamp: new Date().toISOString(),
        run_id: "run-1",
        cost: 0.05,
        memory_type: MemoryType.Decision,
        visibility: MemoryVisibility.Shared,
      },
    });

    expect(result).not.toBeNull();
    expect(result?.content).toBe("Implemented JWT authentication");
    expect(result?.metadata.memory_type).toBe(MemoryType.Decision);
  });

  it("query() returns matching observations", async () => {
    const results = await memoryService.query({
      query: "JWT",
      company_id: "comp-1",
      project_id: "proj-1",
      agent_id: "agent-1",
      agent_role: "Backend Engineer",
      topK: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("JWT");
  });

  it("query() filters by memory_type", async () => {
    const results = await memoryService.query({
      query: "",
      company_id: "comp-1",
      project_id: "proj-1",
      agent_id: "agent-1",
      agent_role: "Backend Engineer",
      memory_type: MemoryType.Decision,
    });

    expect(results.every((r) => r.metadata.memory_type === MemoryType.Decision)).toBe(true);
  });

  it("purgeProject() removes project observations", async () => {
    await memoryService.purgeProject("comp-1", "proj-1");

    const results = await memoryService.query({
      query: "",
      company_id: "comp-1",
      project_id: "proj-1",
      agent_id: "agent-1",
      agent_role: "Backend Engineer",
    });

    expect(results.length).toBe(0);
  });

  it("purgeCompany() removes company observations", async () => {
    await memoryService.store({
      companyId: "comp-2",
      projectId: "proj-2",
      agentId: "agent-2",
      content: "Test company memory",
      metadata: {
        company_id: "comp-2",
        project_id: "proj-2",
        agent_id: "agent-2",
        task_id: "task-2",
        goal_ancestry: [],
        agent_role: "CEO",
        timestamp: new Date().toISOString(),
        run_id: "run-2",
        cost: 0,
        memory_type: MemoryType.Architecture,
        visibility: MemoryVisibility.CeoOnly,
      },
    });

    await memoryService.purgeCompany("comp-2");

    const results = await memoryService.query({
      query: "",
      company_id: "comp-2",
      project_id: "proj-2",
      agent_id: "agent-2",
      agent_role: "CEO",
    });

    expect(results.length).toBe(0);
  });
});
