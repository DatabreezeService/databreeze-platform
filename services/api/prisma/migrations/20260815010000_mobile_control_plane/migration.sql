CREATE SCHEMA IF NOT EXISTS "mobile";
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('mobile', 'mobile-control-plane')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "mobile"."route_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "token_digest" CHAR(64) NOT NULL,
  "route" VARCHAR(256) NOT NULL,
  "actor_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mobile_route_tokens_digest_key" ON "mobile"."route_tokens" ("token_digest");
CREATE INDEX "mobile_route_tokens_scope_expiry_idx" ON "mobile"."route_tokens" ("organization_id", "workspace_id", "expires_at");

CREATE TABLE "mobile"."push_registrations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "platform" VARCHAR(16) NOT NULL,
  "provider_token_digest" CHAR(64) NOT NULL,
  "installation_id_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_registrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mobile_push_registration_identity_key" ON "mobile"."push_registrations" ("organization_id", "workspace_id", "actor_id", "installation_id_hash");
CREATE INDEX "mobile_push_registration_actor_idx" ON "mobile"."push_registrations" ("organization_id", "workspace_id", "actor_id", "status");

CREATE TABLE "mobile"."reports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "report_type" VARCHAR(64) NOT NULL,
  "subject_id" UUID,
  "payload_digest" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mobile_reports_scope_created_idx" ON "mobile"."reports" ("organization_id", "workspace_id", "actor_id", "created_at");
