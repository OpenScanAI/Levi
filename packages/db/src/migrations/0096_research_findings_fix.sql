-- Add missing enum values for research_session_status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelling' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'research_session_status')) THEN
        ALTER TYPE "research_session_status" ADD VALUE 'cancelling';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'research_session_status')) THEN
        ALTER TYPE "research_session_status" ADD VALUE 'cancelled';
    END IF;
END $$;

-- Add missing columns to research_findings that were added to schema but not in the original 0091 migration
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "is_duplicate" boolean DEFAULT false;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "reliability_score" integer;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "source_domain" text;
ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "source_title" text;

-- Create the enum type if it doesn't exist for confidence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_finding_confidence') THEN
    CREATE TYPE research_finding_confidence AS ENUM ('high', 'medium', 'low');
  END IF;
END $$;

ALTER TABLE "research_findings" ADD COLUMN IF NOT EXISTS "confidence" research_finding_confidence DEFAULT 'medium';

-- Add missing columns to research_tasks that were added to schema but not in the original 0091 migration
ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "reliability_score" integer;
ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "findings_summary" text;
ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "sources" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "sequence_order" integer DEFAULT 0;
