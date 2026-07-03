-- Add recovery_only flag to heartbeat_runs so cheap/recovery models can be blocked from writing deliverables.
ALTER TABLE "heartbeat_runs" ADD COLUMN IF NOT EXISTS "recovery_only" boolean NOT NULL DEFAULT false;
