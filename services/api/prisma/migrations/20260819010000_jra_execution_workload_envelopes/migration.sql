-- JRA-033/DDA-061: immutable, attempt-bound server workload envelopes.
-- The application validates the closed envelope before this row is written. This table stores
-- only opaque references and bounded JSON metadata; it never stores source bytes or credentials.
CREATE TABLE "jra"."execution_workload_envelopes" (
    "workload_id" UUID NOT NULL,
    "descriptor_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "descriptor_hash" CHAR(64) NOT NULL,
    "attempt_binding_hash" CHAR(64) NOT NULL,
    "envelope" JSONB NOT NULL,
    "canonical_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "execution_workload_envelopes_pkey" PRIMARY KEY ("workload_id")
);

CREATE UNIQUE INDEX "execution_workload_envelopes_attempt_key"
  ON "jra"."execution_workload_envelopes"("attempt_id");
CREATE UNIQUE INDEX "execution_workload_envelopes_descriptor_attempt_key"
  ON "jra"."execution_workload_envelopes"("descriptor_id", "attempt_id");
CREATE UNIQUE INDEX "execution_workload_envelopes_hash_key"
  ON "jra"."execution_workload_envelopes"("canonical_hash");
CREATE INDEX "execution_workload_envelopes_scope_job_idx"
  ON "jra"."execution_workload_envelopes"("organization_id", "workspace_id", "project_id", "job_id");

ALTER TABLE "jra"."execution_workload_envelopes"
  ADD CONSTRAINT "execution_workload_envelopes_descriptor_fkey"
  FOREIGN KEY ("descriptor_id") REFERENCES "jra"."execution_request_descriptors"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jra"."execution_workload_envelopes"
  ADD CONSTRAINT "execution_workload_envelopes_attempt_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "jra"."execution_attempts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "jra"."reject_execution_workload_envelope_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'JRA_EXECUTION_WORKLOAD_ENVELOPE_IMMUTABLE';
END;
$$;

CREATE TRIGGER "execution_workload_envelopes_immutable"
BEFORE UPDATE OR DELETE ON "jra"."execution_workload_envelopes"
FOR EACH ROW EXECUTE FUNCTION "jra"."reject_execution_workload_envelope_mutation"();
