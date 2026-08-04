-- FA-015: scope idempotency must remain unique when nullable ancestry columns are NULL.
ALTER TABLE "fa"."recipe_assignments"
  ADD COLUMN "scope_key" VARCHAR(200);

UPDATE "fa"."recipe_assignments"
SET "scope_key" = CASE
  WHEN "scope_type" = 'organization'
    THEN concat('organization:', "organization_id"::text)
  WHEN "scope_type" = 'workspace'
    THEN concat('workspace:', "organization_id"::text, ':', "workspace_id"::text)
  WHEN "scope_type" = 'project'
    THEN concat('project:', "organization_id"::text, ':', "workspace_id"::text, ':', "project_id"::text)
  ELSE NULL
END;

ALTER TABLE "fa"."recipe_assignments"
  ALTER COLUMN "scope_key" SET NOT NULL;

ALTER TABLE "fa"."recipe_assignments"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6);

UPDATE "fa"."recipe_assignments"
SET "updated_at" = "created_at";

ALTER TABLE "fa"."recipe_assignments"
  ALTER COLUMN "updated_at" SET NOT NULL;

DROP INDEX "fa"."recipe_assignments_scope_idempotency_key";
CREATE UNIQUE INDEX "recipe_assignments_scope_idempotency_key"
  ON "fa"."recipe_assignments" ("scope_key", "idempotency_key");
