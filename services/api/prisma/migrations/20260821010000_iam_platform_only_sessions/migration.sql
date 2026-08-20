ALTER TABLE "iam"."sessions"
  ADD COLUMN "principal_kind" VARCHAR(16) NOT NULL DEFAULT 'TENANT',
  ALTER COLUMN "organization_id" DROP NOT NULL,
  ALTER COLUMN "workspace_id" DROP NOT NULL;

ALTER TABLE "iam"."sessions"
  ADD CONSTRAINT "sessions_principal_scope_check"
  CHECK (
    ("principal_kind" = 'TENANT' AND "organization_id" IS NOT NULL AND "workspace_id" IS NOT NULL)
    OR
    ("principal_kind" = 'PLATFORM' AND "organization_id" IS NULL AND "workspace_id" IS NULL)
  );
