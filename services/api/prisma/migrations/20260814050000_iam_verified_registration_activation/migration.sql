-- IAM-022/IAM-023: protected pending registrations and idempotent atomic activation/session binding.
ALTER TABLE "iam"."email_verification_challenges"
  ADD COLUMN "pending_registration_envelope" TEXT,
  ADD COLUMN "activation_idempotency_key" VARCHAR(200),
  ADD COLUMN "activation_request_hash" CHAR(64),
  ADD COLUMN "activation_result_envelope" TEXT,
  ADD COLUMN "activated_session_id" UUID;

CREATE UNIQUE INDEX "email_verification_challenges_activation_idempotency_key"
  ON "iam"."email_verification_challenges"("activation_idempotency_key");

-- Pre-v4 active challenges cannot be activated safely because they have no protected
-- pending credential envelope. Revoke them during migration; callers can request a new OTP.
UPDATE "iam"."email_verification_challenges"
SET "status" = 'REVOKED', "revoked_at" = now(), "revision" = "revision" + 1
WHERE "status" = 'ACTIVE' AND "pending_registration_envelope" IS NULL;

ALTER TABLE "iam"."email_verification_challenges"
  ADD CONSTRAINT "email_verification_challenges_pending_envelope_bounded"
    CHECK (
      "pending_registration_envelope" IS NULL
      OR octet_length("pending_registration_envelope") BETWEEN 32 AND 65536
    ),
  ADD CONSTRAINT "email_verification_challenges_active_pending_envelope"
    CHECK ("status" <> 'ACTIVE' OR "pending_registration_envelope" IS NOT NULL),
  ADD CONSTRAINT "email_verification_challenges_activation_fields_complete"
    CHECK (
      ("status" = 'CONSUMED'
        AND "activation_idempotency_key" IS NOT NULL
        AND "activation_request_hash" IS NOT NULL
        AND "activation_result_envelope" IS NOT NULL
        AND "activated_session_id" IS NOT NULL)
      OR
      ("activation_idempotency_key" IS NULL
        AND "activation_request_hash" IS NULL
        AND "activation_result_envelope" IS NULL
        AND "activated_session_id" IS NULL)
    );
