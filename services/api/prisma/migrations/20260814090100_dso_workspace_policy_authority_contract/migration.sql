-- DSO-026/027, IAM-019 contract stage. The expand migration and owner repair/purge
-- gate must establish an exact full-scope binding for every Workspace first.
SELECT "dso"."assert_workspace_data_mode_policy_binding_ready"();

ALTER TABLE "iam"."workspaces"
  ALTER COLUMN "data_mode_policy_id" SET NOT NULL,
  ALTER COLUMN "current_data_mode_policy_version_id" SET NOT NULL,
  ALTER COLUMN "data_mode_projection" SET NOT NULL;
