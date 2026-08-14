-- JRA-009/JRA-010/JRA-011/JRA-028: durable approval scope and CAS support.
-- Rollback: stop approval admission, retain immutable policy/decision history,
-- restore the prior indexes/columns only after an approved compatibility review.

ALTER TABLE "jra"."approval_policies"
  ADD COLUMN "organization_id" UUID;

UPDATE "jra"."approval_policies" AS policies
SET "organization_id" = workspaces."organization_id"
FROM "iam"."workspaces" AS workspaces
WHERE workspaces."id" = policies."workspace_id";

ALTER TABLE "jra"."approval_policies"
  ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX "jra"."approval_policies_workspace_version_key";
DROP INDEX "jra"."approval_policies_workspace_status_idx";

CREATE UNIQUE INDEX "approval_policies_scope_version_key"
  ON "jra"."approval_policies"("organization_id", "workspace_id", "version");
CREATE INDEX "approval_policies_scope_status_idx"
  ON "jra"."approval_policies"("organization_id", "workspace_id", "status");

ALTER TABLE "jra"."approval_decisions"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "project_id" UUID;

UPDATE "jra"."approval_decisions" AS decisions
SET
  "organization_id" = requests."organization_id",
  "workspace_id" = requests."workspace_id",
  "project_id" = requests."project_id"
FROM "jra"."approval_requests" AS requests
WHERE requests."id" = decisions."approval_request_id";

ALTER TABLE "jra"."approval_decisions"
  ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX "approval_decisions_scope_request_idx"
  ON "jra"."approval_decisions"(
    "organization_id", "workspace_id", "project_id", "approval_request_id"
  );
