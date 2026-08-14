-- IAE-024: immutable, attempt-bound worker result finalization attestations.
ALTER TABLE "iae"."worker_object_capability_records"
  ADD COLUMN "result_finalization_binding" JSONB;

ALTER TABLE "iae"."content_placements"
  ADD COLUMN "payload_class" VARCHAR(48) NOT NULL DEFAULT 'ORIGINAL_CONTENT',
  ADD CONSTRAINT "content_placements_payload_class_check"
    CHECK ("payload_class" IN ('ORIGINAL_CONTENT', 'RECONSTRUCTABLE_DERIVED_CONTENT', 'APPROVED_DERIVED_RESULT'));

CREATE TABLE "iae"."worker_result_finalization_attestations" (
  "id" UUID NOT NULL,
  "scope_key" VARCHAR(128) NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "job_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "execution_descriptor_id" UUID NOT NULL,
  "execution_descriptor_hash" CHAR(64) NOT NULL,
  "submission_id" UUID NOT NULL,
  "artifact_version_id" UUID NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "content_length" BIGINT NOT NULL,
  "media_type" VARCHAR(255) NOT NULL,
  "source_lineage_hash" CHAR(64) NOT NULL,
  "output_policy_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "finalized_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "worker_result_finalization_attestations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "worker_result_attestations_hashes_check" CHECK (
    "execution_descriptor_hash" ~ '^[a-f0-9]{64}$'
    AND "content_sha256" ~ '^[a-f0-9]{64}$'
    AND "source_lineage_hash" ~ '^[a-f0-9]{64}$'
    AND "output_policy_hash" ~ '^[a-f0-9]{64}$'
    AND "request_hash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "worker_result_attestations_content_length_check" CHECK ("content_length" >= 0),
  CONSTRAINT "worker_result_attestations_scope_shape_check" CHECK (
    ("scope_type" = 'organization' AND "workspace_id" IS NULL AND "project_id" IS NULL)
    OR ("scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "project_id" IS NULL)
    OR ("scope_type" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL)
  ),
  CONSTRAINT "worker_result_attestations_version_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "iae"."artifact_versions"("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "worker_result_attestations_scope_submission_key"
  ON "iae"."worker_result_finalization_attestations"("scope_key", "submission_id");
CREATE UNIQUE INDEX "worker_result_attestations_scope_version_key"
  ON "iae"."worker_result_finalization_attestations"("scope_key", "artifact_version_id");
CREATE INDEX "worker_result_attestations_scope_attempt_idx"
  ON "iae"."worker_result_finalization_attestations"
    ("organization_id", "workspace_id", "project_id", "attempt_id");

CREATE OR REPLACE FUNCTION "iae"."reject_worker_result_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IAE_WORKER_RESULT_IMMUTABLE';
END;
$$;

CREATE TRIGGER "worker_result_attestations_immutable"
BEFORE UPDATE OR DELETE ON "iae"."worker_result_finalization_attestations"
FOR EACH ROW EXECUTE FUNCTION "iae"."reject_worker_result_mutation"();

CREATE OR REPLACE FUNCTION "iae"."reject_attested_artifact_version_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "iae"."worker_result_finalization_attestations"
    WHERE "artifact_version_id" = OLD."id"
  ) THEN
    IF TG_OP = 'DELETE'
       OR NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."artifact_id" IS DISTINCT FROM OLD."artifact_id"
       OR NEW."scope_type" IS DISTINCT FROM OLD."scope_type"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
       OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."source_kind" IS DISTINCT FROM OLD."source_kind"
       OR NEW."data_mode" IS DISTINCT FROM OLD."data_mode"
       OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256"
       OR NEW."byte_size" IS DISTINCT FROM OLD."byte_size"
       OR NEW."media_type" IS DISTINCT FROM OLD."media_type"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IAE_WORKER_RESULT_IMMUTABLE';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "attested_artifact_versions_immutable"
BEFORE UPDATE OR DELETE ON "iae"."artifact_versions"
FOR EACH ROW EXECUTE FUNCTION "iae"."reject_attested_artifact_version_mutation"();

CREATE OR REPLACE FUNCTION "iae"."reject_attested_placement_identity_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "iae"."worker_result_finalization_attestations"
    WHERE "artifact_version_id" = OLD."artifact_version_id"
  ) AND (
    TG_OP = 'DELETE'
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."artifact_version_id" IS DISTINCT FROM OLD."artifact_version_id"
    OR NEW."scope_type" IS DISTINCT FROM OLD."scope_type"
    OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
    OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
    OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."opaque_reference" IS DISTINCT FROM OLD."opaque_reference"
    OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256"
    OR NEW."payload_class" IS DISTINCT FROM OLD."payload_class"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IAE_WORKER_RESULT_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "attested_content_placements_immutable"
BEFORE UPDATE OR DELETE ON "iae"."content_placements"
FOR EACH ROW EXECUTE FUNCTION "iae"."reject_attested_placement_identity_mutation"();

CREATE OR REPLACE FUNCTION "iae"."reject_attested_lineage_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "iae"."worker_result_finalization_attestations"
    WHERE "artifact_version_id" = OLD."derived_artifact_version_id"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IAE_WORKER_RESULT_IMMUTABLE';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "attested_artifact_lineage_immutable"
BEFORE UPDATE OR DELETE ON "iae"."artifact_lineage"
FOR EACH ROW EXECUTE FUNCTION "iae"."reject_attested_lineage_mutation"();
