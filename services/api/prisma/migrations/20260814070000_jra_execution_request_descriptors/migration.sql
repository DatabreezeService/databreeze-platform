-- JRA-001/JRA-002/JRA-004/JRA-005/JRA-007/JRA-013/JRA-023
-- Immutable typed execution metadata only. No source bytes, credentials, URLs, paths,
-- database connection data, or arbitrary commands belong in this table.
CREATE TABLE "jra"."execution_request_descriptors" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "action_type" VARCHAR(128) NOT NULL,
    "action_version" INTEGER NOT NULL,
    "input_schema_id" VARCHAR(128) NOT NULL,
    "output_schema_id" VARCHAR(128) NOT NULL,
    "handler_digest" CHAR(64) NOT NULL,
    "required_capabilities" JSONB NOT NULL,
    "side_effect_class" VARCHAR(32) NOT NULL,
    "risk_class" VARCHAR(24) NOT NULL,
    "input_object_ids" JSONB NOT NULL,
    "input_manifest_hash" CHAR(64) NOT NULL,
    "parameters" JSONB NOT NULL,
    "output_object_id" VARCHAR(512) NOT NULL,
    "output_max_bytes" INTEGER NOT NULL,
    "output_media_type" VARCHAR(128) NOT NULL,
    "deadline" TIMESTAMPTZ(6) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "canonical_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "execution_request_descriptors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_request_descriptors_deadline_check" CHECK ("deadline" > "created_at"),
    CONSTRAINT "execution_request_descriptors_output_bytes_check" CHECK ("output_max_bytes" BETWEEN 1 AND 1073741824)
);

CREATE UNIQUE INDEX "execution_request_descriptors_job_key" ON "jra"."execution_request_descriptors"("job_id");
CREATE UNIQUE INDEX "execution_request_descriptors_hash_key" ON "jra"."execution_request_descriptors"("canonical_hash");
CREATE INDEX "execution_request_descriptors_scope_job_idx" ON "jra"."execution_request_descriptors"("organization_id", "workspace_id", "project_id", "job_id");

CREATE FUNCTION "jra"."reject_execution_request_descriptor_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'JRA_EXECUTION_REQUEST_DESCRIPTOR_IMMUTABLE';
END;
$$;

CREATE TRIGGER "execution_request_descriptors_immutable"
BEFORE UPDATE OR DELETE ON "jra"."execution_request_descriptors"
FOR EACH ROW EXECUTE FUNCTION "jra"."reject_execution_request_descriptor_mutation"();
