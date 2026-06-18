-- Create the enum type if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_depth') THEN
    CREATE TYPE research_depth AS ENUM ('shallow', 'medium', 'deep');
  END IF;
END $$;

-- Only fix if the column is still integer (not already enum)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_sessions' AND column_name = 'depth'
    AND data_type = 'integer'
  ) THEN
    -- Drop the default first to avoid cast issues
    ALTER TABLE "research_sessions" ALTER COLUMN "depth" DROP DEFAULT;

    -- Fix research_sessions depth column type from integer to enum
    ALTER TABLE "research_sessions" ALTER COLUMN "depth" TYPE research_depth USING
      CASE "depth"
        WHEN 1 THEN 'shallow'::research_depth
        WHEN 2 THEN 'medium'::research_depth
        WHEN 3 THEN 'deep'::research_depth
        ELSE 'medium'::research_depth
      END;

    -- Set the new default
    ALTER TABLE "research_sessions" ALTER COLUMN "depth" SET DEFAULT 'medium'::research_depth;
  END IF;
END $$;
