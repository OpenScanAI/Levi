import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  companies,
  companyMemberships,
  createDb,
  heartbeatRuns,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.js";
import { recoveryOnlyGuard } from "../routes/recovery-only-guard.js";

vi.hoisted(() => {
  process.env.PAPERCLIP_HOME = "/tmp/paperclip-test-home";
  process.env.PAPERCLIP_INSTANCE_ID = "vitest";
  process.env.PAPERCLIP_LOG_DIR = "/tmp/paperclip-test-home/logs";
  process.env.PAPERCLIP_IN_WORKTREE = "false";
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

type Db = ReturnType<typeof createDb>;

async function createCompany(db: Db) {
  const company = await db
    .insert(companies)
    .values({
      name: `Recovery Only ${randomUUID()}`,
      issuePrefix: `RO${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    })
    .returning()
    .then((rows) => rows[0]!);
  await db.insert(companyMemberships).values({
    companyId: company.id,
    principalType: "user",
    principalId: `owner-${randomUUID()}`,
    status: "active",
    membershipRole: "owner",
  });
  return company;
}

async function createAgent(db: Db, companyId: string) {
  return db
    .insert(agents)
    .values({
      companyId,
      name: "test-agent",
      adapterKey: "claude_local",
      adapterConfig: {},
    })
    .returning()
    .then((rows) => rows[0]!);
}

async function createRun(db: Db, agentId: string, companyId: string, recoveryOnly: boolean) {
  return db
    .insert(heartbeatRuns)
    .values({
      agentId,
      companyId,
      status: "running",
      recoveryOnly,
    })
    .returning()
    .then((rows) => rows[0]!);
}

describeEmbeddedPostgres("recovery-only write restrictions", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-recovery-only-write-restrictions-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("heartbeatService.isRecoveryOnlyRun returns true for a recovery-only run", async () => {
    const company = await createCompany(db);
    const agent = await createAgent(db, company.id);
    const run = await createRun(db, agent.id, company.id, true);

    const heartbeat = heartbeatService(db);
    expect(await heartbeat.isRecoveryOnlyRun(run.id)).toBe(true);
  });

  it("heartbeatService.isRecoveryOnlyRun returns false for a normal run", async () => {
    const company = await createCompany(db);
    const agent = await createAgent(db, company.id);
    const run = await createRun(db, agent.id, company.id, false);

    const heartbeat = heartbeatService(db);
    expect(await heartbeat.isRecoveryOnlyRun(run.id)).toBe(false);
  });

  it("recoveryOnlyGuard throws forbidden when actor run is recovery-only", async () => {
    const company = await createCompany(db);
    const agent = await createAgent(db, company.id);
    const run = await createRun(db, agent.id, company.id, true);
    const guard = recoveryOnlyGuard(db);

    const req = { actor: { type: "agent", agentId: agent.id, runId: run.id } } as any;
    await expect(guard(req)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("recovery-only mode"),
    });
  });

  it("recoveryOnlyGuard is a no-op when actor run is not recovery-only", async () => {
    const company = await createCompany(db);
    const agent = await createAgent(db, company.id);
    const run = await createRun(db, agent.id, company.id, false);
    const guard = recoveryOnlyGuard(db);

    const req = { actor: { type: "agent", agentId: agent.id, runId: run.id } } as any;
    await expect(guard(req)).resolves.toBeUndefined();
  });

  it("recoveryOnlyGuard is a no-op when actor has no runId", async () => {
    const guard = recoveryOnlyGuard(db);
    const req = { actor: { type: "agent", agentId: "agent-1", runId: null } } as any;
    await expect(guard(req)).resolves.toBeUndefined();
  });
});
