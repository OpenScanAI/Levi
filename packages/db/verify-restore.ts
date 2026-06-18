import postgres from "postgres";

const sql = postgres({ host: "127.0.0.1", port: 54329, database: "postgres", username: "postgres", connect_timeout: 5 });

async function main() {
  const companies = await sql`SELECT id, name, issue_prefix, status FROM companies`;
  const agents = await sql`SELECT id, name, role, title, status FROM agents ORDER BY name`;

  console.log("Company count:", companies.length);
  console.log("Agent count:", agents.length);
  console.log("\n=== COMPANIES ===");
  companies.forEach((r: any) => console.log(JSON.stringify(r)));
  console.log("\n=== AGENTS ===");
  agents.forEach((r: any) => console.log(JSON.stringify(r)));

  await sql.end();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
