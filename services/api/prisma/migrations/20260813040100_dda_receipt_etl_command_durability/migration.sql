-- DDA-041/DDA-053: durable tenant-scoped receipt command replay and ETL
-- acceptance reservation/CAS. These records contain bounded metadata and
-- references only; IAE/DSM/JRA/AUD remain the authorities for external data,
-- execution, governed versions, and audit history.
--
-- External ETL effects are not part of this database transaction. The
-- acceptance command is therefore a durable saga reservation with an owner
-- lease. A worker must complete the proposal CAS and command transition before
-- releasing ownership; an expired reservation is reconciled explicitly as
-- FAILED and is never silently retried.
--
-- Rollback: disable the receipt/ETL command paths, reconcile RESERVED rows,
-- preserve COMPLETED/FAILED history for audit and incident review, then remove
-- only these additive DDA tables and constraints in a reviewed migration. Do
-- not delete IAE originals, DSM versions, JRA results, or AUD history.

ALTER TABLE "dda"."etl_proposals"
  ADD CONSTRAINT "etl_proposals_scope_id_key"
    UNIQUE ("organization_id", "workspace_id", "project_id", "id");

CREATE TABLE "dda"."etl_acceptance_commands" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "expected_revision" INTEGER NOT NULL,
    "command_key" VARCHAR(200) NOT NULL,
    "payload_fingerprint" CHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "owner_token" VARCHAR(128) NOT NULL,
    "lease_expires_at" TIMESTAMPTZ(6),
    "result_document" JSONB,
    "failure_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "etl_acceptance_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "etl_acceptance_commands_state_check"
      CHECK (
        ("state" = 'RESERVED' AND "lease_expires_at" IS NOT NULL AND "result_document" IS NULL AND "failure_code" IS NULL AND "completed_at" IS NULL)
        OR ("state" = 'COMPLETED' AND "lease_expires_at" IS NULL AND "result_document" IS NOT NULL AND "failure_code" IS NULL AND "completed_at" IS NOT NULL)
        OR ("state" = 'FAILED' AND "lease_expires_at" IS NULL AND "result_document" IS NULL AND "failure_code" IS NOT NULL AND "completed_at" IS NULL)
      ),
    CONSTRAINT "etl_acceptance_commands_scope_check"
      CHECK ("scope_type" = 'project'),
    CONSTRAINT "etl_acceptance_commands_revision_check"
      CHECK ("expected_revision" > 0),
    CONSTRAINT "etl_acceptance_commands_nonempty_check"
      CHECK (length("command_key") > 0 AND length("owner_token") > 0),
    CONSTRAINT "etl_acceptance_commands_fingerprint_check"
      CHECK ("payload_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "etl_acceptance_commands_scope_key"
  ON "dda"."etl_acceptance_commands"(
    "organization_id", "workspace_id", "project_id", "command_key"
  );

CREATE UNIQUE INDEX "etl_acceptance_commands_revision_key"
  ON "dda"."etl_acceptance_commands"(
    "organization_id", "workspace_id", "project_id", "proposal_id", "expected_revision"
  );

CREATE UNIQUE INDEX "etl_acceptance_commands_scope_id_key"
  ON "dda"."etl_acceptance_commands"(
    "organization_id", "workspace_id", "project_id", "id"
  );

CREATE INDEX "etl_acceptance_commands_proposal_state_idx"
  ON "dda"."etl_acceptance_commands"(
    "organization_id", "workspace_id", "project_id", "proposal_id", "state"
  );

ALTER TABLE "dda"."etl_acceptance_commands"
  ADD CONSTRAINT "etl_acceptance_commands_scope_proposal_fk"
  FOREIGN KEY ("organization_id", "workspace_id", "project_id", "proposal_id")
  REFERENCES "dda"."etl_proposals"(
    "organization_id", "workspace_id", "project_id", "id"
  )
  ON DELETE RESTRICT;

CREATE TABLE "dda"."receipt_extraction_commands" (
    "id" UUID NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "operation" VARCHAR(16) NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "command_key" VARCHAR(200) NOT NULL,
    "payload_fingerprint" CHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "owner_token" VARCHAR(200),
    "lease_expires_at" TIMESTAMPTZ(6),
    "failure_code" VARCHAR(96),
    "candidate_id" UUID,
    "candidate_document" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "receipt_extraction_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receipt_extraction_commands_state_check"
      CHECK (
        ("state" = 'RESERVED' AND "owner_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "failure_code" IS NULL AND "candidate_id" IS NULL AND "candidate_document" IS NULL AND "completed_at" IS NULL)
        OR ("state" = 'COMPLETED' AND "owner_token" IS NULL AND "lease_expires_at" IS NULL AND "failure_code" IS NULL AND "candidate_id" IS NOT NULL AND "candidate_document" IS NOT NULL AND "completed_at" IS NOT NULL)
        OR ("state" = 'FAILED' AND "owner_token" IS NOT NULL AND "lease_expires_at" IS NULL AND "failure_code" IS NOT NULL AND "candidate_id" IS NULL AND "candidate_document" IS NULL AND "completed_at" IS NULL)
      ),
    CONSTRAINT "receipt_extraction_commands_operation_check"
      CHECK ("operation" IN ('EXTRACT', 'CORRECT')),
    CONSTRAINT "receipt_extraction_commands_scope_check"
      CHECK (
        ("scope_type" = 'organization' AND "workspace_id" IS NULL AND "project_id" IS NULL)
        OR ("scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "project_id" IS NULL)
        OR ("scope_type" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL)
      ),
    CONSTRAINT "receipt_extraction_commands_fingerprint_check"
      CHECK ("payload_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "receipt_commands_scope_operation_key"
  ON "dda"."receipt_extraction_commands"(
    "scope_key", "operation", "artifact_version_id", "source_id", "command_key"
  );

CREATE UNIQUE INDEX "receipt_commands_scope_id_key"
  ON "dda"."receipt_extraction_commands"(
    "organization_id", "workspace_id", "project_id", "id"
  );

CREATE INDEX "receipt_commands_artifact_state_idx"
  ON "dda"."receipt_extraction_commands"(
    "organization_id", "workspace_id", "project_id", "artifact_version_id", "state"
  );

CREATE INDEX "receipt_commands_lease_idx"
  ON "dda"."receipt_extraction_commands"(
    "organization_id", "workspace_id", "project_id", "state", "lease_expires_at"
  );
