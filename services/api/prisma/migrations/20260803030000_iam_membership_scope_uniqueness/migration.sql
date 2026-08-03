-- IAM-004: enforce one membership identity per principal and fully-qualified scope.
-- The expression coalesces nullable descendants so organization/workspace/project
-- scopes cannot bypass uniqueness through PostgreSQL NULL semantics.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "iam"."memberships" AS duplicate
    GROUP BY
      duplicate."principal_type",
      duplicate."principal_id",
      duplicate."scope_type",
      duplicate."organization_id",
      duplicate."workspace_id",
      duplicate."project_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate IAM membership identities must be reconciled before applying scope uniqueness';
  END IF;
END
$$;

CREATE UNIQUE INDEX "memberships_principal_scope_identity_key"
ON "iam"."memberships" (
  "principal_type",
  "principal_id",
  (
    "scope_type" || ':' || "organization_id"::text || ':' ||
    COALESCE("workspace_id"::text, '') || ':' ||
    COALESCE("project_id"::text, '')
  )
);
