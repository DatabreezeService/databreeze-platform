-- DDA-060: durable agent mutation reserve/audit/commit/replay ownership.
-- The result document is application-validated and contains only bounded reference-safe output.

CREATE TABLE "dda"."agent_consequential_commands" (
    "id" UUID NOT NULL,
    "tenant_scope_key" VARCHAR(180) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "actor_id" UUID NOT NULL,
    "tool_name" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "input_fingerprint" CHAR(64) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "owner_token" VARCHAR(128) NOT NULL,
    "lease_expires_at" TIMESTAMPTZ(6),
    "audit_intent_at" TIMESTAMPTZ(6) NOT NULL,
    "audit_attempted_at" TIMESTAMPTZ(6),
    "audit_succeeded_at" TIMESTAMPTZ(6),
    "audit_failure_code" VARCHAR(96),
    "result_reference_id" UUID,
    "result_document" JSONB,
    "failure_code" VARCHAR(96),
    "reconciliation_required_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_consequential_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_commands_state_check" CHECK (
      "state" IN ('RESERVED', 'COMMITTED', 'FAILED', 'RECONCILIATION_REQUIRED')
    ),
    CONSTRAINT "agent_commands_scope_shape_check" CHECK (
      ("scope_type" = 'organization' AND "workspace_id" IS NULL AND "project_id" IS NULL)
      OR ("scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "project_id" IS NULL)
      OR ("scope_type" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "agent_commands_tenant_actor_tool_key"
  ON "dda"."agent_consequential_commands"(
    "tenant_scope_key",
    "actor_id",
    "tool_name",
    "idempotency_key"
  );

CREATE INDEX "agent_commands_scope_state_idx"
  ON "dda"."agent_consequential_commands"(
    "organization_id",
    "workspace_id",
    "project_id",
    "state",
    "updated_at"
  );

CREATE INDEX "agent_commands_lease_idx"
  ON "dda"."agent_consequential_commands"("tenant_scope_key", "state", "lease_expires_at");
