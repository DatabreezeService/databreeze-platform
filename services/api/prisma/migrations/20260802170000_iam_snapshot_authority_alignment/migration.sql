-- IAM-020, IAM-021, DSO-001: keep the authoritative offline snapshot with IAM;
-- DSO stores only operational grants and never creates a parallel identity authority.
ALTER TABLE "iam"."authorization_snapshots"
  ADD COLUMN "user_id" UUID,
  ADD COLUMN "scope_type" VARCHAR(24),
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "permissions" JSONB,
  ADD COLUMN "data_mode" VARCHAR(16);

ALTER TABLE "iam"."authorization_snapshots"
  ALTER COLUMN "user_id" SET NOT NULL,
  ALTER COLUMN "scope_type" SET NOT NULL,
  ALTER COLUMN "permissions" SET NOT NULL,
  ALTER COLUMN "data_mode" SET NOT NULL;

CREATE UNIQUE INDEX "authorization_snapshots_device_revision_key"
  ON "iam"."authorization_snapshots"("device_id", "snapshot_revision");
CREATE INDEX "authorization_snapshots_scope_device_idx"
  ON "iam"."authorization_snapshots"("organization_id", "workspace_id", "project_id", "device_id");

DROP TABLE "dso"."device_authorization_snapshots";
