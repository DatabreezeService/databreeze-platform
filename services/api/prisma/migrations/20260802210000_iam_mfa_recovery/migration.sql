-- Add revisioned MFA factor transitions required by the domain state machine.
ALTER TABLE "iam"."mfa_factors"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- Recovery-code digests are stored separately so they can be redeemed once
-- without exposing the presented value or mutating the immutable digest.
CREATE TABLE "iam"."mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "digest" VARCHAR(256) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mfa_recovery_codes_user_status_idx"
  ON "iam"."mfa_recovery_codes"("user_id", "status");
