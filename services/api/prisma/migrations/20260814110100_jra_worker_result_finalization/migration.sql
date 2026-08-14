-- JRA-007/JRA-012/JRA-023/JRA-031/JRA-032/BUA-023: stable preparation,
-- opaque settlement authority, and atomic verified-result replay.
-- Existing descriptors cannot be assigned a BUA binding safely. A deployment with legacy
-- rows must complete a governed repair before this migration; no identifier is synthesized.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "jra"."execution_request_descriptors"
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'JRA_RESULT_USAGE_SETTLEMENT_BINDING_REPAIR_REQUIRED: execution request descriptors must be repaired by the admission owner before migration';
  END IF;
END $$;

ALTER TABLE "jra"."execution_request_descriptors"
  ADD COLUMN "result_usage_settlement_binding_id" UUID NOT NULL;
CREATE UNIQUE INDEX "execution_request_descriptors_settlement_binding_key"
  ON "jra"."execution_request_descriptors"("result_usage_settlement_binding_id");

CREATE TABLE "jra"."worker_result_preparations" (
  "submission_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "worker_id" UUID NOT NULL,
  "security_epoch" INTEGER NOT NULL,
  "lease_token_hash" CHAR(64) NOT NULL,
  "expected_revision" INTEGER NOT NULL,
  "descriptor_id" UUID NOT NULL,
  "descriptor_hash" CHAR(64) NOT NULL,
  "attempt_binding_hash" CHAR(64) NOT NULL,
  "result_usage_settlement_binding_id" UUID NOT NULL,
  "output_schema_id" VARCHAR(128) NOT NULL,
  "output_policy" JSONB NOT NULL,
  "output_policy_hash" CHAR(64) NOT NULL,
  "subject_bindings" JSONB NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_result_preparations_pkey" PRIMARY KEY ("submission_id")
);

CREATE UNIQUE INDEX "worker_result_preparations_attempt_key"
  ON "jra"."worker_result_preparations"("attempt_id");
CREATE UNIQUE INDEX "worker_result_preparations_fingerprint_key"
  ON "jra"."worker_result_preparations"("fingerprint");
CREATE UNIQUE INDEX "worker_result_preparations_scope_idempotency_key"
  ON "jra"."worker_result_preparations"("scope_type", "organization_id", "workspace_id", "project_id", "idempotency_key");
CREATE INDEX "worker_result_preparations_scope_time_idx"
  ON "jra"."worker_result_preparations"("organization_id", "workspace_id", "project_id", "created_at");

CREATE TABLE "jra"."worker_result_finalizations" (
  "submission_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "result_manifest_id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "worker_id" UUID NOT NULL,
  "security_epoch" INTEGER NOT NULL,
  "descriptor_id" UUID NOT NULL,
  "descriptor_hash" CHAR(64) NOT NULL,
  "output_schema_id" VARCHAR(128) NOT NULL,
  "engine_version" VARCHAR(128) NOT NULL,
  "source_artifact_version_ids" JSONB NOT NULL,
  "source_lineage_hash" CHAR(64) NOT NULL,
  "subject_bindings" JSONB NOT NULL,
  "attestation_references" JSONB NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "result_manifest_hash" CHAR(64) NOT NULL,
  "attempt_revision" INTEGER NOT NULL,
  "job_revision" INTEGER NOT NULL,
  "finalized_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "worker_result_finalizations_pkey" PRIMARY KEY ("submission_id")
);

CREATE UNIQUE INDEX "worker_result_finalizations_attempt_key"
  ON "jra"."worker_result_finalizations"("attempt_id");
CREATE UNIQUE INDEX "worker_result_finalizations_manifest_key"
  ON "jra"."worker_result_finalizations"("result_manifest_id");
CREATE UNIQUE INDEX "worker_result_finalizations_fingerprint_key"
  ON "jra"."worker_result_finalizations"("fingerprint");
CREATE INDEX "worker_result_finalizations_scope_time_idx"
  ON "jra"."worker_result_finalizations"("organization_id", "workspace_id", "project_id", "finalized_at");

ALTER TABLE "jra"."worker_result_preparations"
  ADD CONSTRAINT "worker_result_preparations_attempt_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "jra"."execution_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jra"."worker_result_finalizations"
  ADD CONSTRAINT "worker_result_finalizations_preparation_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "jra"."worker_result_preparations"("submission_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jra"."worker_result_finalizations"
  ADD CONSTRAINT "worker_result_finalizations_manifest_fkey"
  FOREIGN KEY ("result_manifest_id") REFERENCES "jra"."result_manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
