-- IAM-013: store only scoped service-account metadata and a digest of the one-time secret.
CREATE TABLE "iam"."service_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "permissions" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "secret_digest" CHAR(64) NOT NULL,
    "secret_version" INTEGER NOT NULL DEFAULT 1,
    "secret_issued_at" TIMESTAMPTZ(6) NOT NULL,
    "secret_expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_accounts_secret_digest_key"
ON "iam"."service_accounts"("secret_digest");

CREATE INDEX "service_accounts_scope_status_idx"
ON "iam"."service_accounts"("organization_id", "workspace_id", "status");

CREATE INDEX "service_accounts_expiry_status_idx"
ON "iam"."service_accounts"("secret_expires_at", "status");
