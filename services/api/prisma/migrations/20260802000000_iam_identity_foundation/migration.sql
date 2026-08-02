-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "iam";

-- CreateTable
CREATE TABLE "iam"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "security_epoch" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."password_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "algorithm" VARCHAR(32) NOT NULL DEFAULT 'argon2id',
    "encoded_hash" VARCHAR(768) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."workspaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "authorization_epoch" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."memberships" (
    "id" UUID NOT NULL,
    "principal_type" VARCHAR(24) NOT NULL,
    "principal_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "role_id" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'INVITED',
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "access_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "inactivity_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_digest" VARCHAR(128) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" VARCHAR(24) NOT NULL,
    "public_key" VARCHAR(2048) NOT NULL,
    "key_algorithm" VARCHAR(32) NOT NULL DEFAULT 'ED25519',
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "security_epoch" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "factor_type" VARCHAR(24) NOT NULL,
    "secret_reference" VARCHAR(512) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."authorization_snapshots" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "snapshot_revision" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" VARCHAR(1024) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authorization_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "iam"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_credentials_user_id_key" ON "iam"."password_credentials"("user_id");

-- CreateIndex
CREATE INDEX "workspaces_organization_id_idx" ON "iam"."workspaces"("organization_id");

-- CreateIndex
CREATE INDEX "projects_ancestry_idx" ON "iam"."projects"("organization_id", "workspace_id");

-- CreateIndex
CREATE INDEX "memberships_principal_status_idx" ON "iam"."memberships"("principal_id", "status");

-- CreateIndex
CREATE INDEX "memberships_scope_idx" ON "iam"."memberships"("organization_id", "workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "sessions_user_status_idx" ON "iam"."sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_family_idx" ON "iam"."sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_digest_key" ON "iam"."refresh_tokens"("token_digest");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_status_idx" ON "iam"."refresh_tokens"("family_id", "status");

-- CreateIndex
CREATE INDEX "devices_user_status_idx" ON "iam"."devices"("user_id", "status");

-- CreateIndex
CREATE INDEX "devices_organization_status_idx" ON "iam"."devices"("organization_id", "status");

-- CreateIndex
CREATE INDEX "mfa_factors_user_status_idx" ON "iam"."mfa_factors"("user_id", "status");

-- CreateIndex
CREATE INDEX "authorization_snapshots_device_expiry_idx" ON "iam"."authorization_snapshots"("device_id", "expires_at");
