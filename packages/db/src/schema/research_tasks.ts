import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { researchSessions } from "./research_sessions.js";

export const researchTaskStatusEnum = pgEnum("research_task_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const researchTasks = pgTable(
  "research_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: researchTaskStatusEnum("status").notNull().default("pending"),
    findingsSummary: text("findings_summary"),
    sources: jsonb("sources")
      .$type<{ url: string; title: string; snippet?: string }[]>()
      .default([]),
    reliabilityScore: integer("reliability_score"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sequenceOrder: integer("sequence_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("research_tasks_session_idx").on(table.sessionId),
    companyIdx: index("research_tasks_company_idx").on(table.companyId),
    statusIdx: index("research_tasks_status_idx").on(table.status),
    sessionOrderIdx: index("research_tasks_session_order_idx").on(table.sessionId, table.sequenceOrder),
  }),
);
