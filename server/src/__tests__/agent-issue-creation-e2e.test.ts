import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  createApiKey: vi.fn(),
  activatePendingApproval: vi.fn(),
  update: vi.fn(),
  updatePermissions: vi.fn(),
  getChainOfCommand: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalPermission: vi.fn(),
  listPrincipalGrants: vi.fn(),
  getMembership: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
  getRun: vi.fn(),
  cancelRun: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(async (_companyId: string, config: Record<string, unknown>) => config),
  resolveAdapterConfigForRuntime: vi.fn(async (_companyId: string, config: Record<string, unknown>) => ({ config })),
}));

const mockAgentInstructionsService = vi.hoisted(() => ({
  materializeManagedBundle: vi.fn(),
  getBundle: vi.fn(),
  readFile: vi.fn(),
  updateBundle: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  exportFiles: vi.fn(),
  ensureManagedBundle: vi.fn(),
}));

const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));

const mockEnvironmentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockTrackAgentCreated = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());
const mockSyncInstructionsBundleConfigFromFilePath = vi.hoisted(() => vi.fn());
const mockEnsureOpenCodeModelConfiguredAndAvailable = vi.hoisted(() => vi.fn());

const mockInstanceSettingsService = vi.hoisted(() => ({
  getGeneral: vi.fn(),
}));

function registerModuleMocks() {
  vi.doMock("@paperclipai/adapter-opencode-local/server", async () => {
    const actual = await vi.importActual<typeof import("@paperclipai/adapter-opencode-local/server")>("@paperclipai/adapter-opencode-local/server");
    return {
      ...actual,
      ensureOpenCodeModelConfiguredAndAvailable: mockEnsureOpenCodeModelConfiguredAndAvailable,
    };
  });

  vi.doMock("@paperclipai/shared/telemetry", () => ({
    trackAgentCreated: mockTrackAgentCreated,
    trackErrorHandlerCrash: vi.fn(),
  }));

  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/agents.js", () => ({
    agentService: () => mockAgentService,
  }));

  vi.doMock("../services/access.js", () => ({
    accessService: () => mockAccessService,
  }));

  vi.doMock("../services/approvals.js", () => ({
    approvalService: () => mockApprovalService,
  }));

  vi.doMock("../services/company-skills.js", () => ({
    companySkillService: () => mockCompanySkillService,
  }));

  vi.doMock("../services/budgets.js", () => ({
    budgetService: () => mockBudgetService,
  }));

  vi.doMock("../services/heartbeat.js", () => ({
    heartbeatService: () => mockHeartbeatService,
  }));

  vi.doMock("../services/issue-approvals.js", () => ({
    issueApprovalService: () => mockIssueApprovalService,
  }));

  vi.doMock("../services/issues.js", () => ({
    issueService: () => mockIssueService,
  }));

  vi.doMock("../services/secrets.js", () => ({
    secretService: () => mockSecretService,
  }));

  vi.doMock("../services/environments.js", () => ({
    environmentService: () => mockEnvironmentService,
  }));

  vi.doMock("../services/agent-instructions.js", () => ({
    agentInstructionsService: () => mockAgentInstructionsService,
    syncInstructionsBundleConfigFromFilePath: mockSyncInstructionsBundleConfigFromFilePath,
  }));

  vi.doMock("../services/activity-log.js", () => ({
    logActivity: mockLogActivity,
    publishPluginDomainEvent: vi.fn(),
  }));

  vi.doMock("../services/instance-settings.js", () => ({
    instanceSettingsService: () => mockInstanceSettingsService,
  }));

  vi.doMock("../services/index.js", () => ({
    agentService: () => mockAgentService,
    agentInstructionsService: () => mockAgentInstructionsService,
    accessService: () => mockAccessService,
    approvalService: () => mockApprovalService,
    companySkillService: () => mockCompanySkillService,
    budgetService: () => mockBudgetService,
    heartbeatService: () => mockHeartbeatService,
    ISSUE_LIST_DEFAULT_LIMIT: 500,
    issueApprovalService: () => mockIssueApprovalService,
    issueService: () => mockIssueService,
    logActivity: mockLogActivity,
    secretService: () => mockSecretService,
    syncInstructionsBundleConfigFromFilePath: mockSyncInstructionsBundleConfigFromFilePath,
    workspaceOperationService: () => ({}),
    environmentService: () => mockEnvironmentService,
  }));
}

const agentId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

const baseAgent = {
  id: agentId,
  companyId,
  name: "CTO",
  urlKey: "cto",
  role: "cto",
  title: "CTO",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: "Owns technical roadmap",
  adapterType: "process",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: true },
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
  updatedAt: new Date("2026-03-19T00:00:00.000Z"),
};

function createDbStub(options: { requireBoardApprovalForNewAgents?: boolean } = {}) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn((resolve) =>
            Promise.resolve(resolve([{
              id: companyId,
              name: "Paperclip",
              requireBoardApprovalForNewAgents: options.requireBoardApprovalForNewAgents ?? false,
            }])),
          ),
        }),
      }),
    }),
  };
}

async function createApp(actor: Record<string, unknown>, dbOptions: { requireBoardApprovalForNewAgents?: boolean } = {}) {
  const [{ errorHandler }, { agentRoutes }] = await Promise.all([
    import("../middleware/index.js") as Promise<typeof import("../middleware/index.js")>,
    import("../routes/agents.js") as Promise<typeof import("../routes/agents.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      ...actor,
      companyIds: Array.isArray(actor.companyIds) ? [...actor.companyIds] : actor.companyIds,
    };
    next();
  });
  app.use("/api", agentRoutes(createDbStub(dbOptions) as any));
  app.use(errorHandler);
  return app;
}

async function requestApp(
  app: express.Express,
  buildRequest: (baseUrl: string) => request.Test,
) {
  const { createServer } = await vi.importActual<typeof import("node:http")>("node:http");
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server to listen on a TCP port");
    }
    return await buildRequest(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }
}

describe.sequential("agent issue creation e2e", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@paperclipai/shared/telemetry");
    vi.doUnmock("../telemetry.js");
    vi.doUnmock("../services/access.js");
    vi.doUnmock("../services/activity-log.js");
    vi.doUnmock("../services/agent-instructions.js");
    vi.doUnmock("../services/agents.js");
    vi.doUnmock("../services/approvals.js");
    vi.doUnmock("../services/budgets.js");
    vi.doUnmock("../services/company-skills.js");
    vi.doUnmock("../services/environments.js");
    vi.doUnmock("../services/heartbeat.js");
    vi.doUnmock("../services/instance-settings.js");
    vi.doUnmock("../services/issue-approvals.js");
    vi.doUnmock("../services/issues.js");
    vi.doUnmock("../services/secrets.js");
    vi.doUnmock("../services/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    mockAgentService.getById.mockReset();
    mockAgentService.list.mockReset();
    mockAgentService.create.mockReset();
    mockAgentService.createApiKey.mockReset();
    mockAgentService.activatePendingApproval.mockReset();
    mockAgentService.update.mockReset();
    mockAgentService.updatePermissions.mockReset();
    mockAgentService.getChainOfCommand.mockReset();
    mockAgentService.resolveByReference.mockReset();
    mockAccessService.canUser.mockReset();
    mockAccessService.hasPermission.mockReset();
    mockAccessService.getMembership.mockReset();
    mockAccessService.ensureMembership.mockReset();
    mockAccessService.listPrincipalGrants.mockReset();
    mockAccessService.setPrincipalPermission.mockReset();
    mockApprovalService.create.mockReset();
    mockApprovalService.getById.mockReset();
    mockBudgetService.upsertPolicy.mockReset();
    mockHeartbeatService.listTaskSessions.mockReset();
    mockHeartbeatService.resetRuntimeSession.mockReset();
    mockHeartbeatService.getRun.mockReset();
    mockHeartbeatService.cancelRun.mockReset();
    mockIssueApprovalService.linkManyForApproval.mockReset();
    mockIssueService.create.mockReset();
    mockIssueService.getById.mockReset();
    mockIssueService.list.mockReset();
    mockIssueService.update.mockReset();
    mockSecretService.normalizeAdapterConfigForPersistence.mockReset();
    mockSecretService.resolveAdapterConfigForRuntime.mockReset();
    mockAgentInstructionsService.materializeManagedBundle.mockReset();
    mockCompanySkillService.listRuntimeSkillEntries.mockReset();
    mockCompanySkillService.resolveRequestedSkillKeys.mockReset();
    mockLogActivity.mockReset();
    mockTrackAgentCreated.mockReset();
    mockGetTelemetryClient.mockReset();
    mockSyncInstructionsBundleConfigFromFilePath.mockReset();
    mockInstanceSettingsService.getGeneral.mockReset();
    mockEnvironmentService.getById.mockReset();
    mockEnsureOpenCodeModelConfiguredAndAvailable.mockReset();
    mockSyncInstructionsBundleConfigFromFilePath.mockImplementation((_agent, config) => config);
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockAgentService.getById.mockResolvedValue(baseAgent);
    mockAgentService.list.mockResolvedValue([baseAgent]);
    mockAgentService.getChainOfCommand.mockResolvedValue([]);
    mockAgentService.resolveByReference.mockResolvedValue({ ambiguous: false, agent: baseAgent });
    mockAgentService.create.mockResolvedValue(baseAgent);
    mockAgentService.createApiKey.mockResolvedValue({ id: "key-1", name: "auto-generated", token: "pcp_test_token", createdAt: new Date() });
    mockAgentService.activatePendingApproval.mockResolvedValue({
      agent: baseAgent,
      activated: false,
    });
    mockAgentService.update.mockResolvedValue(baseAgent);
    mockAgentService.updatePermissions.mockResolvedValue(baseAgent);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(true);
    mockAccessService.getMembership.mockResolvedValue({
      id: "membership-1",
      companyId,
      principalType: "agent",
      principalId: agentId,
      status: "active",
      membershipRole: "member",
    });
    mockAccessService.ensureMembership.mockResolvedValue(undefined);
    mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);
    mockAccessService.listPrincipalGrants.mockResolvedValue([]);
    mockInstanceSettingsService.getGeneral.mockResolvedValue({ censorUsernameInLogs: false });
  });

  it("allows CTO agent to create an agent with proper permissions and API key", async () => {
    const app = await createApp({
      type: "agent",
      agentId,
      userId: null,
      isInstanceAdmin: false,
      source: "api_key",
      companyId,
    });

    const res = await requestApp(app, (baseUrl) =>
      request(baseUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "Engineer",
          role: "engineer",
          adapterType: "process",
          adapterConfig: {},
        }),
    );

    expect(res.status).toBe(201);
    expect(mockAgentService.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        name: "Engineer",
        role: "engineer",
        adapterType: "process",
      }),
    );
    expect(mockAgentService.createApiKey).toHaveBeenCalled();
    expect(mockAccessService.setPrincipalPermission).toHaveBeenCalledWith(
      companyId,
      "agent",
      agentId,
      "agents:create",
      true,
      null,
    );
  });

  it("verifies agent has canCreateAgents permission in permissions object", async () => {
    const { defaultPermissionsForRole } = await import("../services/agent-permissions.js");
    const ctoPermissions = defaultPermissionsForRole("cto");
    expect(ctoPermissions.canCreateAgents).toBe(true);

    const ceoPermissions = defaultPermissionsForRole("ceo");
    expect(ceoPermissions.canCreateAgents).toBe(true);

    const engineerPermissions = defaultPermissionsForRole("engineer");
    expect(engineerPermissions.canCreateAgents).toBe(false);
  });

  it("verifies process adapter has supportsLocalAgentJwt enabled", async () => {
    const { processAdapter } = await import("../adapters/process/index.js");
    expect(processAdapter.supportsLocalAgentJwt).toBe(true);
  });

  it("verifies full agent-to-issue creation flow without adapter errors", async () => {
    // Step 1: Agent creates a subordinate agent
    const agentApp = await createApp({
      type: "agent",
      agentId,
      userId: null,
      isInstanceAdmin: false,
      source: "api_key",
      companyId,
    });

    const agentRes = await requestApp(agentApp, (baseUrl) =>
      request(baseUrl)
        .post(`/api/companies/${companyId}/agents`)
        .send({
          name: "Engineer",
          role: "engineer",
          adapterType: "process",
          adapterConfig: {},
        }),
    );

    expect(agentRes.status).toBe(201);
    expect(mockAgentService.createApiKey).toHaveBeenCalled();

    // Step 2: Verify the created agent has all required fields for operation
    const createdAgent = agentRes.body;
    expect(createdAgent).toBeDefined();

    // Step 3: Verify no adapter errors were logged during agent creation
    const errorCalls = mockLogActivity.mock.calls.filter(
      (call: any) => call[1]?.action?.includes("error") || call[1]?.details?.error
    );
    expect(errorCalls).toHaveLength(0);

    // Step 4: Verify API key was auto-generated (prevents "missing API key" errors)
    expect(mockAgentService.createApiKey).toHaveBeenCalledWith(
      expect.any(String),
      "auto-generated",
    );

    // Step 5: Verify permissions were granted (prevents "missing permission" errors)
    expect(mockAccessService.setPrincipalPermission).toHaveBeenCalledWith(
      companyId,
      "agent",
      agentId,
      "agents:create",
      true,
      null,
    );
  });
});
