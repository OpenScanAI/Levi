import postgres from "postgres";

const sql = postgres({ host: "127.0.0.1", port: 54329, database: "postgres", username: "postgres", connect_timeout: 5 });

const agents = [
  ["e3a48f00-7ff9-4554-a7ef-b46e2262933a", "a362faac-04e3-42e4-bd01-1f15203f462a", "CEO", "ceo", null, "paused", null, null, "claude_local", "{}", 0, 0, "2026-05-20 10:35:37.651+00", null, "2026-05-20 06:33:47.230651+00", "2026-05-20 10:35:58.702+00", "{}", "{}", null, "manual", "2026-05-20 10:35:58.702+00", null],
  ["05798c10-69f3-4ece-adbc-5081ad4826a6", "a362faac-04e3-42e4-bd01-1f15203f462a", "Frontend Engineer", "engineer", "Frontend Engineer", "idle", "e3a48f00-7ff9-4554-a7ef-b46e2262933a", "React, TypeScript, CSS, UI/UX, Accessibility", "process", "{}", 0, 0, "2026-05-25 08:01:12.079+00", null, "2026-05-25 05:57:44.095874+00", "2026-05-25 08:01:12.079+00", "{}", "{}", null, null, null, null],
  ["9904e251-44cf-4ffa-a5f3-42199b814eb4", "a362faac-04e3-42e4-bd01-1f15203f462a", "QA Tester", "qa", "QA Tester", "idle", "e3a48f00-7ff9-4554-a7ef-b46e2262933a", "Testing, Automation, Edge Cases, Regression, Playwright, Cypress", "process", "{}", 0, 0, "2026-05-25 08:01:12.293+00", null, "2026-05-25 05:58:05.501248+00", "2026-05-25 08:01:12.293+00", "{}", "{}", null, null, null, null],
  ["e3fc6591-2090-4b93-9101-42bb9a1340d1", "a362faac-04e3-42e4-bd01-1f15203f462a", "Backend Engineer", "engineer", "Backend Engineer", "idle", "e3a48f00-7ff9-4554-a7ef-b46e2262933a", "Node.js, Python, APIs, Databases, Auth, Performance", "process", "{}", 0, 0, "2026-05-25 08:01:12.444+00", null, "2026-05-25 05:57:54.558784+00", "2026-05-25 08:01:12.444+00", "{}", "{}", null, null, null, null],
];

async function main() {
  for (const agent of agents) {
    try {
      await sql.unsafe(
        `INSERT INTO public.agents (id, company_id, name, role, title, status, reports_to, capabilities, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents, last_heartbeat_at, metadata, created_at, updated_at, runtime_config, permissions, icon, pause_reason, paused_at, default_environment_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) ON CONFLICT DO NOTHING`,
        agent
      );
      console.log(`Inserted agent: ${agent[2]}`);
    } catch (err: any) {
      console.error(`Error inserting ${agent[2]}: ${err.message}`);
    }
  }
  console.log("Done");
  await sql.end();
}

main();
