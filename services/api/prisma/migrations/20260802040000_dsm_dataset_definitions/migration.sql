-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "dsm";

-- Register the module-owned schema without replacing an existing owner.
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('dsm', 'DSM')
ON CONFLICT ("schema_name") DO NOTHING;

-- CreateTable
CREATE TABLE "dsm"."dataset_definitions" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "schema_version" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "fields" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dataset_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_definitions_dataset_version_key" ON "dsm"."dataset_definitions"("dataset_id", "id");
CREATE INDEX "dataset_definitions_scope_idx" ON "dsm"."dataset_definitions"("organization_id", "workspace_id", "project_id", "dataset_id");
CREATE INDEX "dataset_definitions_versions_idx" ON "dsm"."dataset_definitions"("dataset_id", "created_at");
