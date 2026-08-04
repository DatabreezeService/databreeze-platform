-- IAM-013/INT-004: bind service-account create retries to one actor, target scope, and request hash.
-- The replayable one-time secret is stored only as an application-encrypted envelope.
ALTER TABLE "iam"."service_accounts"
    ADD COLUMN "created_by_actor_id" UUID,
    ADD COLUMN "create_idempotency_key" VARCHAR(200),
    ADD COLUMN "create_request_hash" CHAR(64),
    ADD COLUMN "create_secret_envelope" TEXT;

CREATE UNIQUE INDEX "service_accounts_create_idempotency_key"
ON "iam"."service_accounts"(
    "organization_id",
    "workspace_id",
    "created_by_actor_id",
    "create_idempotency_key"
);

-- PostgreSQL treats NULL values as distinct in a composite unique index. These partial
-- constraints close the organization-scope and workspace-scope retry races explicitly.
CREATE UNIQUE INDEX "service_accounts_create_idempotency_org_key"
ON "iam"."service_accounts"("organization_id", "created_by_actor_id", "create_idempotency_key")
WHERE "workspace_id" IS NULL
  AND "created_by_actor_id" IS NOT NULL
  AND "create_idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX "service_accounts_create_idempotency_workspace_key"
ON "iam"."service_accounts"(
    "organization_id",
    "workspace_id",
    "created_by_actor_id",
    "create_idempotency_key"
)
WHERE "workspace_id" IS NOT NULL
  AND "created_by_actor_id" IS NOT NULL
  AND "create_idempotency_key" IS NOT NULL;
