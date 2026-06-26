import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { assets } from "./assets.js";

export const agentReports = pgTable(
  "agent_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    type: text("type").notNull().default("summary"),
    title: text("title").notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
    pdfUrl: text("pdf_url"),
    logoAssetId: uuid("logo_asset_id").references(() => assets.id),
    generatedBy: uuid("generated_by"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTypeIdx: index("agent_reports_company_type_idx").on(table.companyId, table.type),
    generatedAtIdx: index("agent_reports_generated_at_idx").on(table.generatedAt),
    createdAtIdx: index("agent_reports_created_at_idx").on(table.createdAt),
  }),
);
