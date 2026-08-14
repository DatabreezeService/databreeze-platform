-- DDA refresh identity/reservation/commit hardening.
-- Idempotency ownership is immutable and tenant-scoped; open reservations are unique per
-- exact tenant/dashboard. Execution revisions support optimistic transactional lifecycle claims.

ALTER TABLE "dda"."dashboard_refresh_executions"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "open_key" UUID;

WITH ranked_open AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "scope_type",
        "organization_id",
        "workspace_id",
        "project_id",
        "dashboard_id"
      ORDER BY "updated_at_ms" DESC, "id" DESC
    ) AS "rank"
  FROM "dda"."dashboard_refresh_executions"
  WHERE "state" IN ('PENDING', 'RUNNING', 'VERIFYING')
)
UPDATE "dda"."dashboard_refresh_executions" AS execution
SET
  "state" = 'SUPERSEDED',
  "revision" = execution."revision" + 1,
  "open_key" = NULL
FROM ranked_open
WHERE execution."id" = ranked_open."id"
  AND ranked_open."rank" > 1;

UPDATE "dda"."dashboard_refresh_executions"
SET "open_key" = "dashboard_id"
WHERE "state" IN ('PENDING', 'RUNNING', 'VERIFYING');

CREATE UNIQUE INDEX "dashboard_refresh_executions_scope_open_key"
  ON "dda"."dashboard_refresh_executions"(
    "scope_type",
    "organization_id",
    "workspace_id",
    "project_id",
    "dashboard_id",
    "open_key"
  );

ALTER TABLE "dda"."dashboard_refresh_idempotency"
  DROP CONSTRAINT "dashboard_refresh_idempotency_pkey";

ALTER TABLE "dda"."dashboard_refresh_idempotency"
  ADD CONSTRAINT "dashboard_refresh_idempotency_pkey"
  PRIMARY KEY (
    "scope_type",
    "organization_id",
    "workspace_id",
    "project_id",
    "key_kind",
    "key_value"
  );
