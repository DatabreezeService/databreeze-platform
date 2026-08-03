-- IAM-010: invitation bearer values are short-lived and hashed at rest.
CREATE TABLE "iam"."invitation_tokens" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "role_id" VARCHAR(32) NOT NULL,
    "token_digest" CHAR(64) NOT NULL,
    "email_digest" CHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "consumed_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitation_tokens_token_digest_key"
ON "iam"."invitation_tokens"("token_digest");

CREATE INDEX "invitation_tokens_membership_status_idx"
ON "iam"."invitation_tokens"("membership_id", "status");

CREATE INDEX "invitation_tokens_scope_idx"
ON "iam"."invitation_tokens"("organization_id", "scope_type", "workspace_id", "project_id");
