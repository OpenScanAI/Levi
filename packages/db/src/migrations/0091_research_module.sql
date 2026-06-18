DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_session_status') THEN
        CREATE TYPE "research_session_status" AS ENUM ('planning', 'running', 'paused', 'completed', 'failed');
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_depth') THEN
        CREATE TYPE "research_depth" AS ENUM ('shallow', 'medium', 'deep');
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_task_status') THEN
        CREATE TYPE "research_task_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_finding_confidence') THEN
        CREATE TYPE "research_finding_confidence" AS ENUM ('high', 'medium', 'low');
    END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"query" text NOT NULL,
	"status" "research_session_status" DEFAULT 'planning' NOT NULL,
	"plan" jsonb,
	"report" text,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"depth" "research_depth" DEFAULT 'medium' NOT NULL,
	"max_subtopics" integer DEFAULT 5 NOT NULL,
	"created_by" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "research_task_status" DEFAULT 'pending' NOT NULL,
	"findings_summary" text,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"reliability_score" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"sequence_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"source_title" text,
	"source_domain" text,
	"confidence" "research_finding_confidence" DEFAULT 'medium',
	"reliability_score" integer,
	"category" text,
	"is_duplicate" boolean DEFAULT false,
	"duplicate_of_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"domain" text,
	"reliability_score" integer,
	"access_count" integer DEFAULT 1 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"session_id" uuid,
	"source_finding_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_sessions_company_id_companies_id_fk') THEN
		ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_tasks_session_id_research_sessions_id_fk') THEN
		ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_tasks_company_id_companies_id_fk') THEN
		ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_findings_task_id_research_tasks_id_fk') THEN
		ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_task_id_research_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."research_tasks"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_findings_session_id_research_sessions_id_fk') THEN
		ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_findings_company_id_companies_id_fk') THEN
		ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_findings_duplicate_of_id_research_findings_id_fk') THEN
		ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_duplicate_of_id_research_findings_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."research_findings"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_sources_session_id_research_sessions_id_fk') THEN
		ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_sources_company_id_companies_id_fk') THEN
		ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_memory_company_id_companies_id_fk') THEN
		ALTER TABLE "research_memory" ADD CONSTRAINT "research_memory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_memory_session_id_research_sessions_id_fk') THEN
		ALTER TABLE "research_memory" ADD CONSTRAINT "research_memory_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_memory_source_finding_id_research_findings_id_fk') THEN
		ALTER TABLE "research_memory" ADD CONSTRAINT "research_memory_source_finding_id_research_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."research_findings"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sessions_company_idx" ON "research_sessions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sessions_status_idx" ON "research_sessions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sessions_created_idx" ON "research_sessions" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_tasks_session_idx" ON "research_tasks" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_tasks_company_idx" ON "research_tasks" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_tasks_status_idx" ON "research_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_findings_task_idx" ON "research_findings" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_findings_session_idx" ON "research_findings" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_findings_company_idx" ON "research_findings" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_findings_duplicate_idx" ON "research_findings" USING btree ("is_duplicate","duplicate_of_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_findings_category_idx" ON "research_findings" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sources_session_idx" ON "research_sources" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sources_url_idx" ON "research_sources" USING btree ("url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_sources_domain_idx" ON "research_sources" USING btree ("domain");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_memory_company_key_idx" ON "research_memory" USING btree ("company_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_memory_session_idx" ON "research_memory" USING btree ("session_id");
