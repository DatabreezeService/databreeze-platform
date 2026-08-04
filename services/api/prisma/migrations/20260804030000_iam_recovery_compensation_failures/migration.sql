-- IAM-015: a delivery failure whose compensating revoke cannot be persisted is
-- durably blocked from token completion until an operator resolves the marker.
CREATE TABLE "iam"."recovery_compensation_failures" (
    "token_digest" CHAR(64) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "recovery_compensation_failures_pkey" PRIMARY KEY ("token_digest")
);
