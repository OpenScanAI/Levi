-- Add daily budget tracking columns to agents for per-agent daily spend caps.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "budget_daily_cents" integer NOT NULL DEFAULT 0;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "spent_daily_cents" integer NOT NULL DEFAULT 0;
