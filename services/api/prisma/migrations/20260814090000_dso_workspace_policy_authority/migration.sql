-- DSO-026/027, IAM-019: explicit current Workspace policy authority and content-safe IAM projection.
CREATE UNIQUE INDEX "device_data_mode_policies_scope_version_key"
  ON "dso"."device_data_mode_policies"("organization_id", "workspace_id", "policy_id", "id");

CREATE TABLE "dso"."workspace_data_mode_policies" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "current_version_id" UUID NOT NULL,
  "current_version_hash" CHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_data_mode_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_data_mode_policies_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "workspace_data_mode_policies_hash_check" CHECK ("current_version_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "workspace_data_mode_policies_current_version_fkey"
    FOREIGN KEY ("organization_id", "workspace_id", "id", "current_version_id")
    REFERENCES "dso"."device_data_mode_policies"("organization_id", "workspace_id", "policy_id", "id")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "workspace_data_mode_policies_workspace_key"
  ON "dso"."workspace_data_mode_policies"("organization_id", "workspace_id");
CREATE UNIQUE INDEX "workspace_data_mode_policies_scope_id_key"
  ON "dso"."workspace_data_mode_policies"("organization_id", "workspace_id", "id");
CREATE INDEX "workspace_data_mode_policies_current_idx"
  ON "dso"."workspace_data_mode_policies"("organization_id", "workspace_id", "current_version_id");

CREATE TABLE "dso"."workspace_policy_activations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "policy_snapshot" JSONB NOT NULL,
  "aggregate_revision" INTEGER NOT NULL,
  "authorization_epoch" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_policy_activations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_policy_activations_hash_check" CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "workspace_policy_activations_revision_check" CHECK ("aggregate_revision" > 0),
  CONSTRAINT "workspace_policy_activations_epoch_check" CHECK ("authorization_epoch" > 0)
);
CREATE UNIQUE INDEX "workspace_policy_activations_idempotency_key"
  ON "dso"."workspace_policy_activations"("organization_id", "workspace_id", "idempotency_key");
CREATE INDEX "workspace_policy_activations_scope_idx"
  ON "dso"."workspace_policy_activations"("organization_id", "workspace_id", "created_at");

ALTER TABLE "iam"."workspaces"
  ADD COLUMN "data_mode_policy_id" UUID,
  ADD COLUMN "current_data_mode_policy_version_id" UUID,
  ADD COLUMN "data_mode_projection" VARCHAR(16),
  ADD CONSTRAINT "workspaces_data_mode_projection_check"
    CHECK ("data_mode_projection" IN ('LOCAL', 'HYBRID', 'CLOUD')),
  ADD CONSTRAINT "workspaces_data_mode_binding_complete_check"
    CHECK (
      ("data_mode_policy_id" IS NULL AND "current_data_mode_policy_version_id" IS NULL AND "data_mode_projection" IS NULL)
      OR
      ("data_mode_policy_id" IS NOT NULL AND "current_data_mode_policy_version_id" IS NOT NULL AND "data_mode_projection" IS NOT NULL)
    ),
  ADD CONSTRAINT "workspaces_data_mode_version_fkey"
    FOREIGN KEY ("organization_id", "id", "data_mode_policy_id", "current_data_mode_policy_version_id")
    REFERENCES "dso"."device_data_mode_policies"("organization_id", "workspace_id", "policy_id", "id")
    ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX "workspaces_data_mode_policy_idx"
  ON "iam"."workspaces"("organization_id", "id", "data_mode_policy_id", "current_data_mode_policy_version_id");

-- Expand/backfill stage. Never infer "latest": only a Workspace with exactly one
-- legacy immutable policy version has an unambiguous current binding.
WITH "unambiguous_legacy_policy" AS (
  SELECT
    policy."organization_id",
    policy."workspace_id",
    MIN(policy."policy_id"::text)::uuid AS "policy_id",
    MIN(policy."id"::text)::uuid AS "policy_version_id",
    MIN(policy."canonical_hash"::text) AS "policy_version_hash",
    MIN(policy."mode"::text) AS "mode"
  FROM "dso"."device_data_mode_policies" AS policy
  GROUP BY policy."organization_id", policy."workspace_id"
  HAVING COUNT(*) = 1
)
INSERT INTO "dso"."workspace_data_mode_policies" (
  "id",
  "organization_id",
  "workspace_id",
  "current_version_id",
  "current_version_hash",
  "revision"
)
SELECT
  legacy."policy_id",
  legacy."organization_id",
  legacy."workspace_id",
  legacy."policy_version_id",
  legacy."policy_version_hash",
  1
FROM "unambiguous_legacy_policy" AS legacy
ON CONFLICT ("organization_id", "workspace_id") DO NOTHING;

-- Bind IAM only to an exact full-scope pointer/version match. Incrementing the epoch
-- once invalidates credentials minted before this authority existed.
UPDATE "iam"."workspaces" AS workspace
SET
  "data_mode_policy_id" = current_policy."id",
  "current_data_mode_policy_version_id" = current_policy."current_version_id",
  "data_mode_projection" = policy_version."mode",
  "authorization_epoch" = workspace."authorization_epoch" + 1
FROM "dso"."workspace_data_mode_policies" AS current_policy
JOIN "dso"."device_data_mode_policies" AS policy_version
  ON policy_version."organization_id" = current_policy."organization_id"
 AND policy_version."workspace_id" = current_policy."workspace_id"
 AND policy_version."policy_id" = current_policy."id"
 AND policy_version."id" = current_policy."current_version_id"
 AND policy_version."canonical_hash" = current_policy."current_version_hash"
WHERE workspace."organization_id" = current_policy."organization_id"
  AND workspace."id" = current_policy."workspace_id"
  AND workspace."data_mode_policy_id" IS NULL
  AND workspace."current_data_mode_policy_version_id" IS NULL
  AND workspace."data_mode_projection" IS NULL;

-- Deployment preflight used by the later contract migration. Missing or ambiguous
-- legacy bindings block contraction until an owner resolves them explicitly.
CREATE OR REPLACE FUNCTION "dso"."assert_workspace_data_mode_policy_binding_ready"()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  invalid_binding_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO invalid_binding_count
  FROM "iam"."workspaces" AS workspace
  LEFT JOIN "dso"."workspace_data_mode_policies" AS current_policy
    ON current_policy."organization_id" = workspace."organization_id"
   AND current_policy."workspace_id" = workspace."id"
  LEFT JOIN "dso"."device_data_mode_policies" AS policy_version
    ON policy_version."organization_id" = current_policy."organization_id"
   AND policy_version."workspace_id" = current_policy."workspace_id"
   AND policy_version."policy_id" = current_policy."id"
   AND policy_version."id" = current_policy."current_version_id"
  WHERE workspace."data_mode_policy_id" IS NULL
     OR workspace."current_data_mode_policy_version_id" IS NULL
     OR workspace."data_mode_projection" IS NULL
     OR current_policy."id" IS NULL
     OR policy_version."id" IS NULL
     OR workspace."data_mode_policy_id" <> current_policy."id"
     OR workspace."current_data_mode_policy_version_id" <> current_policy."current_version_id"
     OR workspace."data_mode_projection" <> policy_version."mode"
     OR current_policy."current_version_hash" <> policy_version."canonical_hash";

  IF invalid_binding_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DSO workspace policy binding preflight failed',
      DETAIL = invalid_binding_count || ' Workspace binding(s) are missing, ambiguous, or stale';
  END IF;
END;
$$;
