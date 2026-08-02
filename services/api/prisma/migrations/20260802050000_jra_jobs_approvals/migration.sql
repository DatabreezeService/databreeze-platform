-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "jra";

-- Register the module-owned schema without replacing an existing owner.
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('jra', 'JRA')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "jra"."typed_action_definitions" (
    "id" UUID NOT NULL,
    "action_type" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL,
    "input_schema_id" VARCHAR(128) NOT NULL,
    "output_schema_id" VARCHAR(128) NOT NULL,
    "handler_digest" CHAR(64) NOT NULL,
    "required_capabilities" JSONB NOT NULL,
    "side_effect_class" VARCHAR(32) NOT NULL,
    "risk_class" VARCHAR(24) NOT NULL,
    "default_timeout_seconds" INTEGER NOT NULL,
    "max_attempts" INTEGER NOT NULL,
    "approval_class" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "typed_action_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."jobs" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "requested_by" UUID NOT NULL,
    "action_type" VARCHAR(128) NOT NULL,
    "action_version" INTEGER NOT NULL,
    "input_manifest_hash" CHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."job_transitions" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_state" VARCHAR(32),
    "to_state" VARCHAR(32) NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL,
    CONSTRAINT "job_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."job_outbox" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    CONSTRAINT "job_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."approval_policies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action_matcher" JSONB NOT NULL,
    "minimum_approvals" INTEGER NOT NULL,
    "eligible_roles" JSONB NOT NULL,
    "self_approval_allowed" BOOLEAN NOT NULL,
    "expires_after_minutes" INTEGER NOT NULL,
    "require_mfa" BOOLEAN NOT NULL,
    "conditions" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."approval_requests" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "subject_type" VARCHAR(80) NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_version" INTEGER NOT NULL,
    "subject_hash" CHAR(64) NOT NULL,
    "requested_action" VARCHAR(80) NOT NULL,
    "job_id" UUID,
    "policy_id" UUID NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "requested_by" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jra"."approval_decisions" (
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(512),
    "mfa_assertion_id" UUID,
    "subject_hash" CHAR(64) NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "typed_actions_type_version_key" ON "jra"."typed_action_definitions"("action_type", "version");
CREATE UNIQUE INDEX "jobs_scope_idempotency_key" ON "jra"."jobs"("scope_type", "organization_id", "workspace_id", "project_id", "idempotency_key");
CREATE INDEX "jobs_scope_state_idx" ON "jra"."jobs"("organization_id", "workspace_id", "project_id", "state", "revision");
CREATE INDEX "jobs_action_idx" ON "jra"."jobs"("action_type", "action_version");
CREATE UNIQUE INDEX "job_transitions_job_revision_key" ON "jra"."job_transitions"("job_id", "revision");
CREATE INDEX "job_transitions_job_time_idx" ON "jra"."job_transitions"("job_id", "occurred_at");
CREATE UNIQUE INDEX "job_outbox_job_event_key" ON "jra"."job_outbox"("job_id", "event_type");
CREATE INDEX "job_outbox_delivery_idx" ON "jra"."job_outbox"("delivered_at", "created_at");
CREATE UNIQUE INDEX "approval_policies_workspace_version_key" ON "jra"."approval_policies"("workspace_id", "version");
CREATE INDEX "approval_policies_workspace_status_idx" ON "jra"."approval_policies"("workspace_id", "status");
CREATE INDEX "approval_requests_scope_status_idx" ON "jra"."approval_requests"("organization_id", "workspace_id", "project_id", "status");
CREATE INDEX "approval_requests_subject_idx" ON "jra"."approval_requests"("subject_id", "subject_version");
CREATE UNIQUE INDEX "approval_decisions_request_actor_key" ON "jra"."approval_decisions"("approval_request_id", "actor_id");
CREATE INDEX "approval_decisions_request_time_idx" ON "jra"."approval_decisions"("approval_request_id", "decided_at");
