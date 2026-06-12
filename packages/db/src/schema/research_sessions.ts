import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum, index, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const researchSessionStatusEnum = pgEnum("research_session_status", [
  "planning",
  "running",
  "cancelling",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const researchDepthEnum = pgEnum("research_depth", [
  "shallow",
  "medium",
  "deep",
]);

export const researchSessions = pgTable(
  "research_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    query: text("query").notNull(),
    status: researchSessionStatusEnum("status").notNull().default("planning"),
    plan: jsonb("plan"),
    report: text("report"),
    originalReport: text("original_report"),
    isEdited: boolean("is_edited").notNull().default(false),
    progressPercent: integer("progress_percent").notNull().default(0),
    depth: researchDepthEnum("depth").notNull().default("medium"),
    maxSubtopics: integer("max_subtopics").notNull().default(5),
    createdBy: text("created_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("research_sessions_company_idx").on(table.companyId),
    statusIdx: index("research_sessions_status_idx").on(table.status),
    createdIdx: index("research_sessions_created_idx").on(table.companyId, table.createdAt),
  }),
);
