CREATE TABLE IF NOT EXISTS "dda"."notification_preference_sets" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preference_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preference_sets_revision_ck" CHECK ("revision" >= 1),
  CONSTRAINT "notification_preference_sets_scope_key" UNIQUE ("organization_id", "workspace_id", "recipient_id")
);

CREATE INDEX IF NOT EXISTS "notification_preference_sets_updated_idx"
  ON "dda"."notification_preference_sets" ("organization_id", "workspace_id", "recipient_id", "updated_at");

CREATE TABLE IF NOT EXISTS "dda"."notification_preferences" (
  "id" UUID NOT NULL,
  "set_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "minimum_urgency" VARCHAR(16) NOT NULL,
  "delivery_mode" VARCHAR(16) NOT NULL,
  "quiet_hours" JSONB NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT FALSE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_set_fk" FOREIGN KEY ("set_id") REFERENCES "dda"."notification_preference_sets"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_preferences_category_ck" CHECK ("category" IN ('REVIEWS','DATA','DASHBOARDS','USAGE','SECURITY','BILLING','SYSTEM')),
  CONSTRAINT "notification_preferences_channel_ck" CHECK ("channel" IN ('IN_APP','EMAIL','PUSH','DESKTOP')),
  CONSTRAINT "notification_preferences_urgency_ck" CHECK ("minimum_urgency" IN ('LOW','NORMAL','HIGH','CRITICAL')),
  CONSTRAINT "notification_preferences_delivery_ck" CHECK ("delivery_mode" IN ('IMMEDIATE','DIGEST')),
  CONSTRAINT "notification_preferences_revision_ck" CHECK ("revision" >= 1),
  CONSTRAINT "notification_preferences_set_category_channel_key" UNIQUE ("set_id", "category", "channel")
);

CREATE INDEX IF NOT EXISTS "notification_preferences_scope_key"
  ON "dda"."notification_preferences" ("organization_id", "workspace_id", "recipient_id", "category", "channel");

CREATE TABLE IF NOT EXISTS "dda"."notification_preference_command_receipts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "expected_revision" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "result_document" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preference_command_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preference_receipts_scope_key" UNIQUE ("organization_id", "workspace_id", "recipient_id", "idempotency_key"),
  CONSTRAINT "notification_preference_receipts_hash_ck" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "notification_preference_receipts_revision_ck" CHECK ("expected_revision" >= 1)
);

CREATE INDEX IF NOT EXISTS "notification_preference_receipts_created_idx"
  ON "dda"."notification_preference_command_receipts" ("organization_id", "workspace_id", "recipient_id", "created_at");
