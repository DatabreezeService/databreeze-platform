-- IAM-005: persist only digests for short-lived access-token lookup.
CREATE TABLE "iam"."access_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_digest" VARCHAR(128) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_tokens_digest_key" ON "iam"."access_tokens"("token_digest");
CREATE INDEX "access_tokens_session_status_idx" ON "iam"."access_tokens"("session_id", "status");
CREATE INDEX "access_tokens_expiry_idx" ON "iam"."access_tokens"("expires_at");
