import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentRunTags = pgTable(
  "agent_run_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    runId: uuid("run_id").notNull().references(() => heartbeatRuns.id),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyRunIdx: index("agent_run_tags_company_run_idx").on(table.companyId, table.runId),
    companyTagIdx: index("agent_run_tags_company_tag_idx").on(table.companyId, table.tag),
    createdAtIdx: index("agent_run_tags_created_at_idx").on(table.createdAt),
  }),
);
