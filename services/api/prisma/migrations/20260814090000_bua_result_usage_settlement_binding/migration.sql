CREATE TABLE "bua"."result_usage_settlement_bindings" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "job_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "meter" VARCHAR(40) NOT NULL,
    "settlement_formula" VARCHAR(40) NOT NULL,
    "maximum_admitted_units" BIGINT NOT NULL,
    "entitlement_decision_subject_hash" CHAR(64) NOT NULL,
    "admission_idempotency_key" VARCHAR(200) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL,

    CONSTRAINT "result_usage_settlement_bindings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "result_usage_settlement_bindings_units_check" CHECK ("maximum_admitted_units" > 0),
    CONSTRAINT "result_usage_settlement_bindings_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "result_usage_settlement_bindings_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "result_usage_settlement_bindings_state_check" CHECK ("state" IN ('PREPARED', 'SETTLED', 'RELEASED')),
    CONSTRAINT "result_usage_settlement_bindings_formula_check" CHECK (
      ("meter" = 'artifact_bytes' AND "settlement_formula" = 'COMMITTED_OUTPUT_BYTES') OR
      ("meter" = 'job_count' AND "settlement_formula" = 'SUCCESSFUL_JOB_UNIT')
    ),
    CONSTRAINT "result_usage_settlement_bindings_reservation_fkey"
      FOREIGN KEY ("reservation_id") REFERENCES "bua"."usage_reservations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "result_usage_settlement_bindings_reservation_key"
ON "bua"."result_usage_settlement_bindings"("reservation_id");

CREATE UNIQUE INDEX "result_usage_settlement_bindings_scope_job_key"
ON "bua"."result_usage_settlement_bindings"("scope_key", "job_id");

CREATE UNIQUE INDEX "result_usage_settlement_bindings_scope_idempotency_key"
ON "bua"."result_usage_settlement_bindings"("scope_key", "admission_idempotency_key");

CREATE INDEX "result_usage_settlement_bindings_scope_state_idx"
ON "bua"."result_usage_settlement_bindings"("organization_id", "workspace_id", "project_id", "state", "expires_at");
