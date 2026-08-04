-- IAM-015: preserve the security epoch and force MFA re-enrollment after recovery.
ALTER TABLE "iam"."users"
    ADD COLUMN "mfa_reenrollment_required" BOOLEAN NOT NULL DEFAULT false;

-- IAM-015: raw recovery bearers never persist; only keyed digests are stored.
CREATE TABLE "iam"."recovery_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_digest" CHAR(64) NOT NULL,
    "email_digest" CHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recovery_challenges_token_digest_key"
ON "iam"."recovery_challenges"("token_digest");

CREATE INDEX "recovery_challenges_user_status_idx"
ON "iam"."recovery_challenges"("user_id", "status");

CREATE INDEX "recovery_challenges_expiry_status_idx"
ON "iam"."recovery_challenges"("expires_at", "status");
