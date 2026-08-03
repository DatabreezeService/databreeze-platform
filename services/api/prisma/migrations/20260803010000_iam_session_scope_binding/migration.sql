-- IAM-005/IAM-019: bind every new session to the exact tenant ancestry selected at sign-in.
-- This repository has no production or legacy data migration. Existing development databases
-- with active sessions must be recreated because guessing tenant scope would be unsafe.
ALTER TABLE "iam"."sessions"
    ADD COLUMN "organization_id" UUID NOT NULL,
    ADD COLUMN "workspace_id" UUID NOT NULL;

CREATE INDEX "sessions_scope_user_status_idx"
    ON "iam"."sessions"("organization_id", "workspace_id", "user_id", "status");
