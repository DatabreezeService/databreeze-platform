CREATE TABLE "jra"."recipe_versions" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "recipe_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "action_definitions" JSONB NOT NULL,
    "recipe_hash" CHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_versions_recipe_version_key" ON "jra"."recipe_versions"("recipe_id", "version");
CREATE INDEX "recipe_versions_scope_state_idx" ON "jra"."recipe_versions"("organization_id", "workspace_id", "project_id", "state");

CREATE TABLE "jra"."recipe_triggers" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "trigger_type" VARCHAR(24) NOT NULL,
    "deduplication_key" VARCHAR(200) NOT NULL,
    "authorization_context_hash" CHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    CONSTRAINT "recipe_triggers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_triggers_deduplication_key" ON "jra"."recipe_triggers"("recipe_id", "recipe_version", "deduplication_key");
CREATE INDEX "recipe_triggers_scope_enabled_idx" ON "jra"."recipe_triggers"("organization_id", "workspace_id", "project_id", "enabled");

CREATE TABLE "jra"."recipe_publication_envelopes" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "recipe_hash" CHAR(64) NOT NULL,
    "action_handler_digests" JSONB NOT NULL,
    "action_schema_ids" JSONB NOT NULL,
    "dsm_definition_hashes" JSONB NOT NULL,
    "policy_reference_hashes" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "signer_key_version" VARCHAR(128) NOT NULL,
    "signature" VARCHAR(4096) NOT NULL,
    CONSTRAINT "recipe_publication_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_publication_envelopes_recipe_version_key" ON "jra"."recipe_publication_envelopes"("recipe_id", "recipe_version");
CREATE INDEX "recipe_publication_envelopes_expiry_idx" ON "jra"."recipe_publication_envelopes"("valid_until");
