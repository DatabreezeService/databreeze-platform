-- IAM-007, IAM-021: organization-scoped device enrollment metadata and one-use challenges.
ALTER TABLE "iam"."devices"
  ADD COLUMN "installation_id_hash" VARCHAR(128);

CREATE TABLE "iam"."device_enrollment_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" VARCHAR(24) NOT NULL,
    "installation_id_hash" VARCHAR(128) NOT NULL,
    "challenge_digest" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "device_enrollment_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_enrollment_challenges_org_status_idx"
  ON "iam"."device_enrollment_challenges"("organization_id", "status", "expires_at");
CREATE INDEX "device_enrollment_challenges_user_issued_idx"
  ON "iam"."device_enrollment_challenges"("user_id", "issued_at");
