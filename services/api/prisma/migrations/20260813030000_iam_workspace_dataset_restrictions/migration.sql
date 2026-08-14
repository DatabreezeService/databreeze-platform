-- IAM-024 / DSM-018: durable workspace-member sensitive-dataset deny scopes.
-- No backfill: the previous restriction state existed only in process memory and
-- therefore contains no durable rows that can be migrated safely.
-- ROLLBACK (unpublished/empty only): stop restriction writes, retain audit history,
-- then remove this table and its indexes through an approved compensating migration.

-- Same-module ancestry keys make the restrictive foreign keys below valid without
-- coupling IAM restrictions to DSM's opaque dataset identifiers.
CREATE UNIQUE INDEX "workspaces_organization_scope_id_key"
  ON "iam"."workspaces"("organization_id", "id");

CREATE UNIQUE INDEX "memberships_scope_id_key"
  ON "iam"."memberships"("organization_id", "workspace_id", "id", "scope_type");

CREATE TABLE "iam"."workspace_dataset_restrictions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "member_scope_type" VARCHAR(24) NOT NULL DEFAULT 'WORKSPACE',
    "denied_dataset_ids" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_dataset_restrictions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_dataset_restrictions_scope_member_key"
      UNIQUE ("organization_id", "workspace_id", "member_id"),
    CONSTRAINT "workspace_dataset_restrictions_member_scope_key"
      UNIQUE ("organization_id", "workspace_id", "member_id", "member_scope_type"),
    CONSTRAINT "workspace_dataset_restrictions_scope_id_key"
      UNIQUE ("organization_id", "workspace_id", "id"),
    CONSTRAINT "workspace_dataset_restrictions_member_scope_type_check"
      CHECK ("member_scope_type" = 'WORKSPACE'),
    CONSTRAINT "workspace_dataset_restrictions_workspace_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id")
      REFERENCES "iam"."workspaces"("organization_id", "id")
      ON DELETE RESTRICT,
    CONSTRAINT "workspace_dataset_restrictions_member_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "member_id", "member_scope_type")
      REFERENCES "iam"."memberships"("organization_id", "workspace_id", "id", "scope_type")
      ON DELETE RESTRICT,
    CONSTRAINT "workspace_dataset_restrictions_revision_check"
      CHECK ("revision" >= 1),
    CONSTRAINT "workspace_dataset_restrictions_denied_dataset_ids_check"
      CHECK (
        jsonb_typeof("denied_dataset_ids") = 'array'
        AND jsonb_array_length("denied_dataset_ids") <= 200
      )
);

CREATE INDEX "workspace_dataset_restrictions_workspace_updated_idx"
  ON "iam"."workspace_dataset_restrictions"(
    "organization_id", "workspace_id", "updated_at", "id"
  );
