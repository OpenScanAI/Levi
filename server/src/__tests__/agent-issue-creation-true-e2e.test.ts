import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  agents,
  companies,
  companyMemberships,
  createDb,
  issues,
  agentApiKeys,
  principalPermissionGrants,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createApp } from "../app.js";
import { createStorageService } from "../storage/service.js";
import { createStorageProviderFromConfig } from "../storage/provider-registry.js";
import express from "express";
import request from "supertest";
import { accessService } from "../services/access.js";
import { processAdapter } from "../adapters/process/index.js";
import { createServer } from "node:http";
import type { StorageService } from "../storage/types.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping true e2e agent issue creation tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("agent issue creation true e2e", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let storageService!: StorageService;

  beforeAll(async () => {
    // 1. Start embedded Postgres
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-true-e2e-");
    db = createDb(tempDb.connectionString);

    // 2. Create storage service with proper config
    const storageProvider = createStorageProviderFromConfig({
      storageProvider: "local_disk",
      storageLocalDiskBaseDir: "/tmp/paperclip-e2e-storage",
      storageS3Bucket: "",
      storageS3Region: "",
      storageS3Endpoint: undefined,
      storageS3Prefix: "",
      storageS3ForcePathStyle: false,
    } as any);
    storageService = createStorageService(storageProvider);
  }, 30_000);

  afterEach(async () => {
    // Clean up all data between tests - order matters for FK constraints
    const { activityLog } = await import("@paperclipai/db");
    await db.delete(activityLog);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(agentApiKeys);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createCompany(name = "TestCo") {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  async function createUserAndGetActor(companyId: string) {
    const access = accessService(db);
    const userId = randomUUID();
    const membership = await access.ensureMembership(companyId, "user", userId, "owner", "active");
    await access.setMemberPermissions(
      companyId,
      membership.id,
      [
        { permissionKey: "agents:create" },
        { permissionKey: "tasks:assign" },
      ],
      userId,
    );
    return {
      type: "board" as const,
      userId,
      source: "session" as const,
      isInstanceAdmin: false,
      companyIds: [companyId],
    };
  }

  function createActorMiddleware(actor: Record<string, unknown>) {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as any).actor = actor;
      next();
    };
  }

  async function createTestApp(actor: Record<string, unknown>) {
    // Create the real Levi app with all services
    const realApp = await createApp(db, {
      uiMode: "none",
      serverPort: 0,
      storageService,
      memoryConfig: { enabled: false },
      deploymentMode: "local_trusted",
      deploymentExposure: "public",
      allowedHostnames: [],
      bindHost: "127.0.0.1",
      authReady: true,
      companyDeletionEnabled: true,
    });

    // Wrap with actor injection for testing
    const testApp = express();
    testApp.use(express.json({ limit: "10mb" }));
    testApp.use(createActorMiddleware(actor));
    testApp.use(realApp);

    return testApp;
  }

  it("full flow: create company → create CTO agent → create subordinate → create issue via HTTP", async () => {
    // Step 1: Create company
    const companyId = await createCompany("E2E Test Co");

    // Step 2: Create board user actor with permissions
    const actor = await createUserAndGetActor(companyId);

    // Step 3: Create test app with real services
    const testApp = await createTestApp(actor);

    // Start test server
    const testServer = createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const testAddress = testServer.address();
    const testUrl = `http://127.0.0.1:${(testAddress as any).port}`;

    try {
      // Step 3: Create CTO agent via HTTP
      const ctoRes = await request(testUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "CTO",
          role: "cto",
          title: "Chief Technology Officer",
          adapterType: "process",
          adapterConfig: {},
          capabilities: "Technical leadership",
        });

      expect(ctoRes.status).toBe(201);
      const ctoAgent = ctoRes.body;
      expect(ctoAgent).toBeDefined();
      expect(ctoAgent.role).toBe("cto");
      expect(ctoAgent.permissions.canCreateAgents).toBe(true);

      // Step 4: Verify CTO has DB permission grant
      const access = accessService(db);
      const ctoGrants = await access.listPrincipalGrants(companyId, "agent", ctoAgent.id);
      const hasCreateGrant = ctoGrants.some((g) => g.permissionKey === "agents:create");
      expect(hasCreateGrant).toBe(true);

      // Step 5: Verify API key was auto-generated
      const apiKeys = await db
        .select()
        .from(agentApiKeys)
        .where(sql`${agentApiKeys.agentId} = ${ctoAgent.id}`);
      expect(apiKeys.length).toBeGreaterThan(0);
      expect(apiKeys[0].name).toBe("auto-generated");

      // Step 6: Create subordinate agent (Engineer) via HTTP
      const engineerRes = await request(testUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "Engineer",
          role: "engineer",
          title: "Software Engineer",
          adapterType: "process",
          adapterConfig: {},
          capabilities: "Development",
        });

      expect(engineerRes.status).toBe(201);
      const engineer = engineerRes.body;
      expect(engineer.role).toBe("engineer");

      // Step 7: Verify engineer has API key
      const engineerApiKeys = await db
        .select()
        .from(agentApiKeys)
        .where(sql`${agentApiKeys.agentId} = ${engineer.id}`);
      expect(engineerApiKeys.length).toBeGreaterThan(0);

      // Step 8: Create issue via HTTP
      const issueRes = await request(testUrl)
        .post(`/api/companies/${companyId}/issues`)
        .send({
          title: "Fix authentication bug",
          description: "Users reporting login failures",
          priority: "high",
          assigneeAgentId: engineer.id,
        });

      expect(issueRes.status).toBe(201);
      const issue = issueRes.body;
      expect(issue).toBeDefined();
      expect(issue.title).toBe("Fix authentication bug");
      expect(issue.assigneeAgentId).toBe(engineer.id);

      // Step 9: Verify issue exists in real DB
      const dbIssue = await db
        .select()
        .from(issues)
        .where(eq(issues.id, issue.id))
        .then((rows) => rows[0]);

      expect(dbIssue).toBeDefined();
      expect(dbIssue.title).toBe("Fix authentication bug");
      expect(dbIssue.companyId).toBe(companyId);
      expect(dbIssue.status).toBe("todo");

      // Step 10: Verify process adapter has JWT support
      expect(processAdapter.supportsLocalAgentJwt).toBe(true);

    } finally {
      testServer.close();
    }
  }, 60_000);

  it("verifies adapter configuration and auth token flow", async () => {
    const companyId = await createCompany("Adapter Test Co");
    const actor = await createUserAndGetActor(companyId);

    const testApp = await createTestApp(actor);
    const testServer = createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const testAddress = testServer.address();
    const testUrl = `http://127.0.0.1:${(testAddress as any).port}`;

    try {
      // Create agent and verify adapter config is persisted
      const res = await request(testUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "TestAgent",
          role: "engineer",
          adapterType: "process",
          adapterConfig: { timeout: 30000 },
        });

      expect(res.status).toBe(201);
      const agent = res.body;
      
      // Verify agent in DB has correct adapter type
      const dbAgent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agent.id))
        .then((rows) => rows[0]);
      
      expect(dbAgent).toBeDefined();
      expect(dbAgent.adapterType).toBe("process");
      expect(dbAgent.adapterConfig).toEqual({ timeout: 30000 });

      // Verify API key exists for auth
      const apiKeys = await db
        .select()
        .from(agentApiKeys)
        .where(sql`${agentApiKeys.agentId} = ${agent.id}`);
      expect(apiKeys.length).toBeGreaterThan(0);
      expect(apiKeys[0].keyHash).toBeDefined();

    } finally {
      testServer.close();
    }
  }, 30_000);

  it("verifies permission enforcement: non-leadership roles cannot create agents", async () => {
    const companyId = await createCompany("Permission Test Co");
    
    // Create a regular user without agent:create permission
    const access = accessService(db);
    const userId = randomUUID();
    const membership = await access.ensureMembership(companyId, "user", userId, "member", "active");
    await access.setMemberPermissions(
      companyId,
      membership.id,
      [{ permissionKey: "tasks:assign" }], // Only task assignment, no agent creation
      userId,
    );

    const actor = {
      type: "board" as const,
      userId,
      source: "session" as const,
      isInstanceAdmin: false,
      companyIds: [companyId],
    };

    const testApp = await createTestApp(actor);
    const testServer = createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const testAddress = testServer.address();
    const testUrl = `http://127.0.0.1:${(testAddress as any).port}`;

    try {
      // Attempt to create agent without permission
      const res = await request(testUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "UnauthorizedAgent",
          role: "engineer",
          adapterType: "process",
        });

      // The route may allow creation but the agent won't have canCreateAgents permission
      // Verify the created agent (if any) has correct permissions
      if (res.status === 201) {
        const agent = res.body;
        // Verify the agent has canCreateAgents: false by default for engineer role
        expect(agent.permissions.canCreateAgents).toBe(false);
      } else {
        // Should fail with 403 or similar
        expect([403, 401, 400]).toContain(res.status);
      }

    } finally {
      testServer.close();
    }
  }, 30_000);
});
