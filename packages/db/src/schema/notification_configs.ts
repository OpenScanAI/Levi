import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const notificationConfigs = pgTable(
  "notification_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    type: text("type").notNull(),
    targetUrl: text("target_url").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTypeIdx: index("notification_configs_company_type_idx").on(table.companyId, table.type),
    companyEnabledIdx: index("notification_configs_company_enabled_idx").on(table.companyId, table.enabled),
    createdAtIdx: index("notification_configs_created_at_idx").on(table.createdAt),
  }),
);
