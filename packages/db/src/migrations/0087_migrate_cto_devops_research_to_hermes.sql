-- Migration: Migrate CTO, DevOps, and Research agents from claude_local to hermes_local
-- Issue: https://github.com/OpenScanAI/Levi/issues/22
--
-- Goals:
--   1. Switch adapterType from "claude_local" to "hermes_local" for cto, devops, researcher roles
--   2. Set Kimi (kimi-k2.5) as the default model via adapterConfig
--   3. Preserve existing instructionsFilePath if present
--   4. Map existing "command" to "hermesCommand" for Hermes compatibility
--   5. Set sensible Hermes defaults: timeoutSec, graceSec, persistSession
--   6. Leave all other agents untouched

UPDATE "agents"
SET
  "adapter_type" = 'hermes_local',
  "adapter_config" = (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'model', 'kimi-k2.5',
      'provider', 'kimi-coding',
      'timeoutSec', 300,
      'graceSec', 10,
      'persistSession', true,
      'instructionsFilePath', CASE
        WHEN "adapter_config"->>'instructionsFilePath' IS NOT NULL
        THEN "adapter_config"->>'instructionsFilePath'
        ELSE NULL
      END,
      'hermesCommand', CASE
        WHEN "adapter_config"->>'command' IS NOT NULL AND "adapter_config"->>'command' != ''
        THEN "adapter_config"->>'command'
        WHEN "adapter_config"->>'hermesCommand' IS NOT NULL AND "adapter_config"->>'hermesCommand' != ''
        THEN "adapter_config"->>'hermesCommand'
        ELSE NULL
      END,
      'promptTemplate', CASE
        WHEN "adapter_config"->>'promptTemplate' IS NOT NULL AND "adapter_config"->>'promptTemplate' != ''
        THEN "adapter_config"->>'promptTemplate'
        ELSE NULL
      END,
      'env', CASE
        WHEN "adapter_config"->'env' IS NOT NULL AND jsonb_typeof("adapter_config"->'env') = 'object'
        THEN "adapter_config"->'env'
        ELSE NULL
      END,
      'extraArgs', CASE
        WHEN "adapter_config"->'extraArgs' IS NOT NULL AND jsonb_typeof("adapter_config"->'extraArgs') = 'array'
        THEN "adapter_config"->'extraArgs'
        ELSE NULL
      END,
      'cwd', CASE
        WHEN "adapter_config"->>'cwd' IS NOT NULL AND "adapter_config"->>'cwd' != ''
        THEN "adapter_config"->>'cwd'
        ELSE NULL
      END
    ))
  ),
  "updated_at" = now()
WHERE "role" IN ('cto', 'devops', 'researcher')
  AND "adapter_type" = 'claude_local';
