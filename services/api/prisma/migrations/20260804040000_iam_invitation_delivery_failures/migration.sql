-- IAM-010: retain a durable block when an invitation delivery acknowledgement fails.
CREATE TABLE "iam"."invitation_delivery_failures" (
    "token_digest" CHAR(64) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "invitation_delivery_failures_pkey" PRIMARY KEY ("token_digest")
);
