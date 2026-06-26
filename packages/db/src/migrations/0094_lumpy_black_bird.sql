CREATE TABLE "agent_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"severity" text DEFAULT 'info' NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"description" text,
	"cvss_score" integer,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text DEFAULT 'summary' NOT NULL,
	"title" text NOT NULL,
	"content_json" jsonb,
	"pdf_url" text,
	"logo_asset_id" uuid,
	"generated_by" uuid,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"target_url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_logo_asset_id_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_tags" ADD CONSTRAINT "agent_run_tags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_tags" ADD CONSTRAINT "agent_run_tags_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_findings_company_agent_idx" ON "agent_findings" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "agent_findings_company_severity_idx" ON "agent_findings" USING btree ("company_id","severity");--> statement-breakpoint
CREATE INDEX "agent_findings_run_id_idx" ON "agent_findings" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_findings_verified_idx" ON "agent_findings" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "agent_findings_created_at_idx" ON "agent_findings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_reports_company_type_idx" ON "agent_reports" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "agent_reports_generated_at_idx" ON "agent_reports" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "agent_reports_created_at_idx" ON "agent_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_run_tags_company_run_idx" ON "agent_run_tags" USING btree ("company_id","run_id");--> statement-breakpoint
CREATE INDEX "agent_run_tags_company_tag_idx" ON "agent_run_tags" USING btree ("company_id","tag");--> statement-breakpoint
CREATE INDEX "agent_run_tags_created_at_idx" ON "agent_run_tags" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_configs_company_type_idx" ON "notification_configs" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "notification_configs_company_enabled_idx" ON "notification_configs" USING btree ("company_id","enabled");--> statement-breakpoint
CREATE INDEX "notification_configs_created_at_idx" ON "notification_configs" USING btree ("created_at");