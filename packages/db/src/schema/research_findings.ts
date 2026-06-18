import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { researchSessions } from "./research_sessions.js";
import { researchTasks } from "./research_tasks.js";

export const researchFindingConfidenceEnum = pgEnum("research_finding_confidence", [
  "high",
  "medium",
  "low",
]);

export const researchFindings = pgTable(
  "research_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => researchTasks.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    sourceDomain: text("source_domain"),
    confidence: researchFindingConfidenceEnum("confidence").default("medium"),
    reliabilityScore: integer("reliability_score"),
    category: text("category"),
    isDuplicate: boolean("is_duplicate").default(false),
    duplicateOfId: uuid("duplicate_of_id").references((): any => researchFindings.id),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("research_findings_task_idx").on(table.taskId),
    sessionIdx: index("research_findings_session_idx").on(table.sessionId),
    companyIdx: index("research_findings_company_idx").on(table.companyId),
    duplicateIdx: index("research_findings_duplicate_idx").on(table.isDuplicate, table.duplicateOfId),
    categoryIdx: index("research_findings_category_idx").on(table.category),
    companySessionCreatedIdx: index("research_findings_company_session_created_idx").on(table.companyId, table.sessionId, table.createdAt),
  }),
);
