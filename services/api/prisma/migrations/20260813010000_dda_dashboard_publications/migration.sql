-- DDA-025/026/032: durable immutable dashboard publication commits.
-- DEPLOYMENT PRECONDITION: before running this migration, deploy and verify
-- publication admission that rejects SHARED_LINK, then stop/disable every
-- legacy writer that can create SHARED_LINK snapshots. Do not install this
-- migration while those writers remain active; rolling deployment ordering is
-- admission block/legacy-writer stop, then this migration, then the later
-- operator validation gate below.
-- Existing rows retain nullable proof columns for rolling deployment. Every
-- new publication and refresh/event writer must persist binding_proof_version=1
-- with the complete server-derived proof in both the compatibility envelope and
-- dedicated column. Publication replay explicitly rejects proofless legacy rows;
-- operators must migrate them before treating them as replayable publications.
-- Rollback: stop publication admission, retain published snapshots and audit
-- history, then remove only these additive structures after an approved
-- compensating migration. Never update or delete an immutable snapshot.

ALTER TABLE "dda"."dashboard_snapshots"
  ADD COLUMN "input_selector_hash" CHAR(64);

ALTER TABLE "dda"."dashboard_snapshots"
  ADD COLUMN "binding_proof" JSONB;

ALTER TABLE "dda"."dashboard_snapshots"
  ADD COLUMN "binding_proof_version" INTEGER;

UPDATE "dda"."dashboard_snapshots"
SET "input_selector_hash" = "materialization_ids" ->> 'inputSelectorHash'
WHERE jsonb_typeof("materialization_ids") = 'object'
  AND "materialization_ids" ? 'inputSelectorHash';

ALTER TABLE "dda"."dashboard_snapshots"
  ADD CONSTRAINT "dashboard_snapshots_member_audience_check"
  CHECK ("audience" IN ('OWNER', 'WORKSPACE_VIEWERS', 'PROJECT_VIEWERS')) NOT VALID;

ALTER TABLE "dda"."dashboard_snapshots"
  ADD CONSTRAINT "dashboard_snapshots_binding_proof_pair_check"
  CHECK (
    ("binding_proof_version" IS NULL AND "binding_proof" IS NULL)
    OR ("binding_proof_version" = 1 AND "binding_proof" IS NOT NULL)
  ) NOT VALID;

COMMENT ON CONSTRAINT "dashboard_snapshots_member_audience_check"
  ON "dda"."dashboard_snapshots" IS
  'Rolling-deployment preflight constraint. Legacy SHARED_LINK rows remain readable but are never admitted by publication code. Validate later with ALTER TABLE dda.dashboard_snapshots VALIDATE CONSTRAINT dashboard_snapshots_member_audience_check after an operator preflight confirms no legacy violations.';

COMMENT ON CONSTRAINT "dashboard_snapshots_binding_proof_pair_check"
  ON "dda"."dashboard_snapshots" IS
  'New publication and refresh/event writers must persist proof version 1 and a non-null exact binding proof. Legacy proofless rows remain readable only for explicit remediation; publication replay rejects them.';

ALTER TABLE "dda"."dashboard_snapshots"
  ADD CONSTRAINT "dashboard_snapshots_scope_version_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "dashboard_version_id")
  REFERENCES "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT NOT VALID;

CREATE TABLE "dda"."dashboard_publication_idempotency" (
    "key_value" VARCHAR(200) NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_publication_idempotency_pkey"
      PRIMARY KEY ("organization_id", "workspace_id", "project_id", "key_value")
);

CREATE UNIQUE INDEX "dashboard_publication_idempotency_snapshot_key"
  ON "dda"."dashboard_publication_idempotency"(
    "organization_id", "workspace_id", "project_id", "snapshot_id"
  );

CREATE INDEX "dashboard_publication_idempotency_dashboard_idx"
  ON "dda"."dashboard_publication_idempotency"(
    "organization_id", "workspace_id", "project_id", "dashboard_id"
  );

ALTER TABLE "dda"."dashboard_publication_idempotency"
  ADD CONSTRAINT "dashboard_publication_idempotency_scope_snapshot_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "snapshot_id")
  REFERENCES "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_idempotency_scope_dashboard_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "dashboard_id")
  REFERENCES "dda"."dashboards"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_idempotency_scope_version_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "version_id")
  REFERENCES "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT;

CREATE TABLE "dda"."dashboard_publication_audit_outbox" (
    "id" UUID NOT NULL,
    "key_value" VARCHAR(200) NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "correlation_id" UUID NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "approval_id" UUID,
    "prior_published_version_id" UUID,
    "audience" VARCHAR(32) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_publication_audit_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_publication_audit_key"
  ON "dda"."dashboard_publication_audit_outbox"(
    "organization_id", "workspace_id", "project_id", "key_value"
  );

CREATE UNIQUE INDEX "dashboard_publication_audit_snapshot_key"
  ON "dda"."dashboard_publication_audit_outbox"(
    "organization_id", "workspace_id", "project_id", "snapshot_id"
  );

CREATE INDEX "dashboard_publication_audit_dashboard_idx"
  ON "dda"."dashboard_publication_audit_outbox"(
  "organization_id", "workspace_id", "project_id", "dashboard_id"
  );

CREATE TABLE "dda"."dashboard_publication_approval_invalidation_outbox" (
    "id" UUID NOT NULL,
    "key_value" VARCHAR(200) NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "prior_published_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "action" VARCHAR(96) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" VARCHAR(128),
    "lease_expires_at" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(512),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_publication_approval_invalidation_outbox_pkey"
      PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dda_pub_inval_scope_subject_key"
  ON "dda"."dashboard_publication_approval_invalidation_outbox"(
    "organization_id", "workspace_id", "project_id", "key_value", "prior_published_version_id"
  );

CREATE UNIQUE INDEX "dda_pub_inval_scope_snapshot_key"
  ON "dda"."dashboard_publication_approval_invalidation_outbox"(
    "organization_id", "workspace_id", "project_id", "snapshot_id", "prior_published_version_id"
  );

CREATE INDEX "dda_pub_inval_scope_state_idx"
  ON "dda"."dashboard_publication_approval_invalidation_outbox"(
    "organization_id", "workspace_id", "project_id", "state"
  );

CREATE INDEX "dda_pub_inval_scope_claim_idx"
  ON "dda"."dashboard_publication_approval_invalidation_outbox"(
    "organization_id", "workspace_id", "project_id", "state", "next_attempt_at", "lease_expires_at", "created_at"
  );

ALTER TABLE "dda"."dashboard_publication_approval_invalidation_outbox"
  ADD CONSTRAINT "dashboard_publication_approval_invalidation_scope_snapshot_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "snapshot_id")
  REFERENCES "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_approval_invalidation_scope_dashboard_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "dashboard_id")
  REFERENCES "dda"."dashboards"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_approval_invalidation_scope_prior_version_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "prior_published_version_id")
  REFERENCES "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT;

ALTER TABLE "dda"."dashboard_publication_audit_outbox"
  ADD CONSTRAINT "dashboard_publication_audit_scope_dashboard_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "dashboard_id")
  REFERENCES "dda"."dashboards"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_audit_scope_version_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "version_id")
  REFERENCES "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_audit_scope_prior_version_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "prior_published_version_id")
  REFERENCES "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "dashboard_publication_audit_scope_snapshot_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "snapshot_id")
  REFERENCES "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT;

ALTER TABLE "dda"."dashboard_refresh_state"
  ADD CONSTRAINT "dashboard_refresh_state_scope_dashboard_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "dashboard_id")
  REFERENCES "dda"."dashboards"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT "dashboard_refresh_state_scope_snapshot_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "last_snapshot_id")
  REFERENCES "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "id")
  ON DELETE RESTRICT NOT VALID;

-- OPERATOR VALIDATION GATE (later controlled migration, after the deployment
-- precondition above): inspect legacy rows, then validate the NOT VALID checks
-- and FKs. New writes are checked immediately by PostgreSQL; legacy SHARED_LINK
-- rows remain readable and are not widened until an explicit policy migration.
-- The executable preflight.sql must pass before this migration is applied.
-- The executable post-deploy-validate.sql is a later ordered operator gate;
-- Prisma must not run it as part of this additive migration.
