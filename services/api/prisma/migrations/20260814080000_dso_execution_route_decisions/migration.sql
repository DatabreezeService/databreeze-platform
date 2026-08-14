-- DSO-024/026/027: immutable, expiring execution-routing policy decisions. This table contains
-- exact identifiers, classifications, hashes, and policy references only; it never stores content.
CREATE TABLE "dso"."execution_route_decisions" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "artifact_version_id" UUID NOT NULL,
    "artifact_version_hash" CHAR(64) NOT NULL,
    "placement_id" UUID NOT NULL,
    "placement_hash" CHAR(64) NOT NULL,
    "data_mode" VARCHAR(16) NOT NULL,
    "data_classification" VARCHAR(24) NOT NULL,
    "payload_class" VARCHAR(40) NOT NULL,
    "placement_kind" VARCHAR(64) NOT NULL,
    "placement_available" BOOLEAN NOT NULL,
    "action_type" VARCHAR(128) NOT NULL,
    "action_version" INTEGER NOT NULL,
    "required_capabilities" JSONB NOT NULL,
    "target" VARCHAR(16) NOT NULL,
    "target_device_id" UUID,
    "executor_class" VARCHAR(64) NOT NULL,
    "granted_capabilities" JSONB NOT NULL,
    "narrowing_constraints" JSONB NOT NULL,
    "data_mode_policy_id" UUID NOT NULL,
    "data_mode_policy_version_id" UUID NOT NULL,
    "data_mode_policy_revision" INTEGER NOT NULL,
    "data_mode_policy_hash" CHAR(64) NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "decision_subject_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "execution_route_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_route_decisions_scope_check" CHECK (
        ("scope_type" = 'workspace' AND "project_id" IS NULL) OR
        ("scope_type" = 'project' AND "project_id" IS NOT NULL)
    ),
    CONSTRAINT "execution_route_decisions_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "execution_route_decisions_action_version_check" CHECK ("action_version" >= 1),
    CONSTRAINT "execution_route_decisions_policy_revision_check" CHECK ("data_mode_policy_revision" >= 1),
    CONSTRAINT "execution_route_decisions_authorization_epoch_check" CHECK ("authorization_epoch" >= 0),
    CONSTRAINT "execution_route_decisions_hash_check" CHECK (
        "artifact_version_hash" ~ '^[a-f0-9]{64}$' AND
        "placement_hash" ~ '^[a-f0-9]{64}$' AND
        "data_mode_policy_hash" ~ '^[a-f0-9]{64}$' AND
        "decision_subject_hash" ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT "execution_route_decisions_target_check" CHECK (
        ("target" = 'CLOUD' AND "target_device_id" IS NULL AND "executor_class" = 'CLOUD') OR
        ("target" = 'DEVICE' AND "target_device_id" IS NOT NULL AND "executor_class" <> 'CLOUD')
    ),
    CONSTRAINT "execution_route_decisions_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "execution_route_decisions_lifetime_check" CHECK ("expires_at" <= "created_at" + INTERVAL '24 hours')
);

CREATE UNIQUE INDEX "execution_route_decisions_route_revision_key"
    ON "dso"."execution_route_decisions"("route_id", "revision");

CREATE UNIQUE INDEX "execution_route_decisions_scope_id_key"
    ON "dso"."execution_route_decisions"(
        "organization_id", "workspace_id", "project_id", "id"
    ) NULLS NOT DISTINCT;

CREATE INDEX "execution_route_decisions_scope_id_idx"
    ON "dso"."execution_route_decisions"("organization_id", "workspace_id", "project_id", "id");

CREATE INDEX "execution_route_decisions_policy_idx"
    ON "dso"."execution_route_decisions"(
        "organization_id", "workspace_id", "data_mode_policy_version_id", "expires_at"
    );

CREATE INDEX "execution_route_decisions_input_idx"
    ON "dso"."execution_route_decisions"("artifact_version_id", "placement_id");

CREATE FUNCTION "dso"."execution_route_decisions_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'DSO execution route decisions are immutable';
END;
$$;

CREATE TRIGGER execution_route_decisions_immutable_trigger
BEFORE UPDATE OR DELETE ON "dso"."execution_route_decisions"
FOR EACH ROW EXECUTE FUNCTION "dso"."execution_route_decisions_immutable"();
