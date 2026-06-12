import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { researchSessions } from "./research_sessions.js";
import { researchFindings } from "./research_findings.js";

export const researchMemory = pgTable(
  "research_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    sessionId: uuid("session_id").references(() => researchSessions.id, { onDelete: "set null" }),
    sourceFindingId: uuid("source_finding_id").references(() => researchFindings.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyIdx: uniqueIndex("research_memory_company_key_idx").on(table.companyId, table.key),
    sessionIdx: index("research_memory_session_idx").on(table.sessionId),
  }),
);
