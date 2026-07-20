-- Backfill cost_cents for heartbeat cost events that were incorrectly
-- recorded as 0 because normalizeBilledCostCents returned 0 for
-- subscription_included billing type.
--
-- The source costUsd is preserved in heartbeat_runs.result_json under
-- the keys costUsd, cost_usd, or total_cost_usd. We round to cents and
-- clamp to a non-negative value, matching the current normalization logic.
UPDATE "cost_events" ce
SET "cost_cents" = GREATEST(
  0,
  ROUND(
    (
      COALESCE(
        (hr."result_json" ->> 'costUsd')::numeric,
        (hr."result_json" ->> 'cost_usd')::numeric,
        (hr."result_json" ->> 'total_cost_usd')::numeric,
        0
      )
    ) * 100
  )
)::integer
FROM "heartbeat_runs" hr
WHERE ce."heartbeat_run_id" = hr."id"
  AND ce."billing_type" = 'subscription_included'
  AND ce."cost_cents" = 0
  AND (
    (hr."result_json" ->> 'costUsd')::numeric > 0
    OR (hr."result_json" ->> 'cost_usd')::numeric > 0
    OR (hr."result_json" ->> 'total_cost_usd')::numeric > 0
  );