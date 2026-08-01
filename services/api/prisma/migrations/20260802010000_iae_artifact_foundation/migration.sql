-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "iae";

-- Register the module-owned schema without replacing an existing owner.
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('iae', 'IAE')
ON CONFLICT ("schema_name") DO NOTHING;

-- CreateTable
CREATE TABLE "iae"."artifact_versions" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "source_kind" VARCHAR(24) NOT NULL,
    "data_mode" VARCHAR(16) NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "media_type" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "artifact_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iae"."content_placements" (
    "id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "opaque_reference" VARCHAR(512) NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iae"."evidence_references" (
    "id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "coordinate" JSONB NOT NULL,
    "source_state" VARCHAR(24) NOT NULL,
    "excerpt" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artifact_versions_artifact_id_idx" ON "iae"."artifact_versions"("artifact_id");
CREATE INDEX "artifact_versions_scope_idx" ON "iae"."artifact_versions"("organization_id", "workspace_id", "project_id");
CREATE INDEX "artifact_versions_content_sha256_idx" ON "iae"."artifact_versions"("content_sha256");
CREATE INDEX "content_placements_artifact_version_idx" ON "iae"."content_placements"("artifact_version_id");
CREATE INDEX "content_placements_scope_idx" ON "iae"."content_placements"("organization_id", "workspace_id", "project_id");
CREATE UNIQUE INDEX "content_placements_version_kind_key" ON "iae"."content_placements"("artifact_version_id", "kind");
CREATE INDEX "evidence_references_artifact_version_idx" ON "iae"."evidence_references"("artifact_version_id");
CREATE INDEX "evidence_references_scope_idx" ON "iae"."evidence_references"("organization_id", "workspace_id", "project_id");
