import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { researchSessions } from "./research_sessions.js";

export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    domain: text("domain"),
    reliabilityScore: integer("reliability_score"),
    accessCount: integer("access_count").notNull().default(1),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("research_sources_session_idx").on(table.sessionId),
    urlIdx: index("research_sources_url_idx").on(table.url),
    domainIdx: index("research_sources_domain_idx").on(table.domain),
  }),
);
