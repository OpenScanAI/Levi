import { createHash } from "node:crypto";
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { applyPendingMigrations } from "./client.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const cleanups: Array<() => Promise<void>> = [];
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

async function createTempDatabase(): Promise<string> {
  const db = await startEmbeddedPostgresTestDatabase("paperclip-db-backfill-");
  cleanups.push(db.cleanup);
  return db.connectionString;
}

async function migrationHash(migrationFile: string): Promise<string> {
  const content = await fs.promises.readFile(
    new URL(`./migrations/${migrationFile}`, import.meta.url),
    "utf8",
  );
  return createHash("sha256").update(content).digest("hex");
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    await cleanup?.();
  }
});

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres backfill tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("0087_backfill_subscription_included_cost_cents", () => {
  it(
    "backfills cost_cents for subscription_included events from heartbeat_runs.result_json",
    async () => {
      const connectionString = await createTempDatabase();

      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
      try {
        const backfillHash = await migrationHash("0087_backfill_subscription_included_cost_cents.sql");
        await sql.unsafe(
          `DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = '${backfillHash}'`,
        );

        const companyId = "00000000-0000-0000-0000-000000000001";
        const agentId = "00000000-0000-0000-0000-000000000002";
        const runId = "00000000-0000-0000-0000-000000000003";
        const eventId = "00000000-0000-0000-0000-000000000004";

        await sql.unsafe(`
          INSERT INTO "companies" ("id", "name", "issue_prefix", "require_board_approval_for_new_agents")
          VALUES ('${companyId}', 'Test Co', 'TCO', false)
        `);

        await sql.unsafe(`
          INSERT INTO "agents" ("id", "company_id", "name", "adapter_type", "status")
          VALUES ('${agentId}', '${companyId}', 'Test Agent', 'openai', 'active')
        `);

        await sql.unsafe(`
          INSERT INTO "heartbeat_runs" (
            "id", "company_id", "agent_id", "status", "result_json"
          )
          VALUES (
            '${runId}',
            '${companyId}',
            '${agentId}',
            'finished',
            '{"costUsd": 1.2345, "cost_usd": 9.99, "total_cost_usd": 99.99}'
          )
        `);

        await sql.unsafe(`
          INSERT INTO "cost_events" (
            "id", "company_id", "agent_id", "heartbeat_run_id", "provider",
            "biller", "billing_type", "model", "cost_cents", "occurred_at"
          )
          VALUES (
            '${eventId}',
            '${companyId}',
            '${agentId}',
            '${runId}',
            'openai',
            'openai',
            'subscription_included',
            'gpt-4o',
            0,
            now()
          )
        `);

        await applyPendingMigrations(connectionString);

        const rows = await sql.unsafe<{ cost_cents: number }[]>(`
          SELECT "cost_cents" FROM "cost_events" WHERE "id" = '${eventId}'
        `);

        // costUsd takes precedence in the COALESCE chain; 1.2345 * 100 = 123.45 -> round -> 123
        expect(rows[0]?.cost_cents).toBe(123);
      } finally {
        await sql.end();
      }
    },
    20_000,
  );

  it(
    "falls back to cost_usd when costUsd is absent",
    async () => {
      const connectionString = await createTempDatabase();

      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
      try {
        const backfillHash = await migrationHash("0087_backfill_subscription_included_cost_cents.sql");
        await sql.unsafe(
          `DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = '${backfillHash}'`,
        );

        const companyId = "00000000-0000-0000-0000-000000000001";
        const agentId = "00000000-0000-0000-0000-000000000002";
        const runId = "00000000-0000-0000-0000-000000000003";
        const eventId = "00000000-0000-0000-0000-000000000004";

        await sql.unsafe(`
          INSERT INTO "companies" ("id", "name", "issue_prefix", "require_board_approval_for_new_agents")
          VALUES ('${companyId}', 'Test Co', 'TCO', false)
        `);

        await sql.unsafe(`
          INSERT INTO "agents" ("id", "company_id", "name", "adapter_type", "status")
          VALUES ('${agentId}', '${companyId}', 'Test Agent', 'openai', 'active')
        `);

        await sql.unsafe(`
          INSERT INTO "heartbeat_runs" (
            "id", "company_id", "agent_id", "status", "result_json"
          )
          VALUES (
            '${runId}',
            '${companyId}',
            '${agentId}',
            'finished',
            '{"cost_usd": 2.5}'
          )
        `);

        await sql.unsafe(`
          INSERT INTO "cost_events" (
            "id", "company_id", "agent_id", "heartbeat_run_id", "provider",
            "biller", "billing_type", "model", "cost_cents", "occurred_at"
          )
          VALUES (
            '${eventId}',
            '${companyId}',
            '${agentId}',
            '${runId}',
            'openai',
            'openai',
            'subscription_included',
            'gpt-4o',
            0,
            now()
          )
        `);

        await applyPendingMigrations(connectionString);

        const rows = await sql.unsafe<{ cost_cents: number }[]>(`
          SELECT "cost_cents" FROM "cost_events" WHERE "id" = '${eventId}'
        `);

        expect(rows[0]?.cost_cents).toBe(250);
      } finally {
        await sql.end();
      }
    },
    20_000,
  );

  it(
    "does not modify events with a non-zero cost_cents or non-subscription billing type",
    async () => {
      const connectionString = await createTempDatabase();

      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
      try {
        const backfillHash = await migrationHash("0087_backfill_subscription_included_cost_cents.sql");
        await sql.unsafe(
          `DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = '${backfillHash}'`,
        );

        const companyId = "00000000-0000-0000-0000-000000000001";
        const agentId = "00000000-0000-0000-0000-000000000002";
        const runId = "00000000-0000-0000-0000-000000000003";
        const includedEventId = "00000000-0000-0000-0000-000000000004";
        const meteredEventId = "00000000-0000-0000-0000-000000000005";

        await sql.unsafe(`
          INSERT INTO "companies" ("id", "name", "issue_prefix", "require_board_approval_for_new_agents")
          VALUES ('${companyId}', 'Test Co', 'TCO', false)
        `);

        await sql.unsafe(`
          INSERT INTO "agents" ("id", "company_id", "name", "adapter_type", "status")
          VALUES ('${agentId}', '${companyId}', 'Test Agent', 'openai', 'active')
        `);

        await sql.unsafe(`
          INSERT INTO "heartbeat_runs" (
            "id", "company_id", "agent_id", "status", "result_json"
          )
          VALUES (
            '${runId}',
            '${companyId}',
            '${agentId}',
            'finished',
            '{"costUsd": 1.5}'
          )
        `);

        await sql.unsafe(`
          INSERT INTO "cost_events" (
            "id", "company_id", "agent_id", "heartbeat_run_id", "provider",
            "biller", "billing_type", "model", "cost_cents", "occurred_at"
          )
          VALUES
            ('${includedEventId}', '${companyId}', '${agentId}', '${runId}', 'openai', 'openai', 'subscription_included', 'gpt-4o', 50, now()),
            ('${meteredEventId}', '${companyId}', '${agentId}', '${runId}', 'openai', 'openai', 'metered_api', 'gpt-4o', 0, now())
        `);

        await applyPendingMigrations(connectionString);

        const rows = await sql.unsafe<{ id: string; cost_cents: number }[]>(`
          SELECT "id", "cost_cents" FROM "cost_events" WHERE "id" IN ('${includedEventId}', '${meteredEventId}')
        `);

        const byId = new Map(rows.map((row) => [row.id, row.cost_cents]));
        expect(byId.get(includedEventId)).toBe(50);
        expect(byId.get(meteredEventId)).toBe(0);
      } finally {
        await sql.end();
      }
    },
    20_000,
  );
});
