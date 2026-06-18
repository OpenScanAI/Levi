-- Add report editing tracking columns to research_sessions
ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "original_report" text,
  ADD COLUMN IF NOT EXISTS "is_edited" boolean NOT NULL DEFAULT false;
