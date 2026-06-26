import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentFindings = pgTable(
  "agent_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    severity: text("severity").notNull().default("info"),
    category: text("category"),
    title: text("title").notNull(),
    description: text("description"),
    cvssScore: integer("cvss_score"),
    verified: boolean("verified").notNull().default(false),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentIdx: index("agent_findings_company_agent_idx").on(table.companyId, table.agentId),
    companySeverityIdx: index("agent_findings_company_severity_idx").on(table.companyId, table.severity),
    runIdIdx: index("agent_findings_run_id_idx").on(table.runId),
    verifiedIdx: index("agent_findings_verified_idx").on(table.verified),
    createdAtIdx: index("agent_findings_created_at_idx").on(table.createdAt),
  }),
);
