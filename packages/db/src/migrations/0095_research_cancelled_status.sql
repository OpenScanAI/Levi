-- Add missing enum values for research session status
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
