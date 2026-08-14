-- NCO-001/NCO-002/NCO-012/NCO-014: durable notification delivery receipts,
-- monotonic projection checkpoints, bundle upserts, and state command receipts.
-- Only opaque identifiers, safe labels, state, and public notification results are stored.
-- Source content, OCR values, evidence, credentials, paths, and provider payloads are absent.
--
-- Rollback: stop notification projection and state commands, preserve committed
-- event/audit history, then remove only these additive receipt/checkpoint tables
-- and restore the prior intent uniqueness after a reviewed compatibility migration.

ALTER TABLE "dda"."notification_intents"
  ADD COLUMN "bundle_key" CHAR(64),
  ADD COLUMN "bundle_window_start" TIMESTAMPTZ(6);

UPDATE "dda"."notification_intents"
SET
  "bundle_key" = lpad(md5("event_id"::text), 64, '0'),
  "bundle_window_start" = "first_occurred_at"
WHERE "bundle_key" IS NULL OR "bundle_window_start" IS NULL;

ALTER TABLE "dda"."notification_intents"
  ALTER COLUMN "bundle_key" SET NOT NULL,
  ALTER COLUMN "bundle_window_start" SET NOT NULL;

DROP INDEX IF EXISTS "notification_intents_recipient_event_key";

ALTER TABLE "dda"."notification_intents"
  ADD CONSTRAINT "notification_intents_bundle_key_check"
    CHECK ("bundle_key" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "notification_intents_bundle_window_check"
    CHECK ("bundle_window_start" <= "last_occurred_at");

CREATE UNIQUE INDEX "notification_intents_recipient_bundle_key"
  ON "dda"."notification_intents"(
    "organization_id", "workspace_id", "recipient_id", "bundle_key"
  );

CREATE TABLE "dda"."notification_projection_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_hash" CHAR(64) NOT NULL,
    "notification_id" UUID NOT NULL,
    "bundle_key" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_projection_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_projection_receipts_event_hash_check"
      CHECK ("event_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "notification_projection_receipts_bundle_key_check"
      CHECK ("bundle_key" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "notification_projection_receipts_event_key"
  ON "dda"."notification_projection_receipts"(
    "organization_id", "workspace_id", "recipient_id", "event_id"
  );

CREATE INDEX "notification_projection_receipts_notification_idx"
  ON "dda"."notification_projection_receipts"(
    "organization_id", "workspace_id", "recipient_id", "notification_id"
  );

CREATE TABLE "dda"."notification_projection_checkpoints" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "consumer_key" VARCHAR(120) NOT NULL,
    "last_event_id" UUID NOT NULL,
    "last_event_hash" CHAR(64) NOT NULL,
    "last_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_projection_checkpoints_pkey"
      PRIMARY KEY ("organization_id", "workspace_id", "consumer_key"),
    CONSTRAINT "notification_projection_checkpoints_hash_check"
      CHECK ("last_event_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "notification_projection_checkpoints_key_check"
      CHECK (length("consumer_key") > 0),
    CONSTRAINT "notification_projection_checkpoints_revision_check"
      CHECK ("revision" > 0)
);

CREATE TABLE "dda"."notification_state_command_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "expected_revision" INTEGER NOT NULL,
    "target_state" VARCHAR(16) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "result_document" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_state_command_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_state_command_receipts_revision_check"
      CHECK ("expected_revision" > 0),
    CONSTRAINT "notification_state_command_receipts_state_check"
      CHECK ("target_state" IN ('READ', 'ARCHIVED', 'DISMISSED')),
    CONSTRAINT "notification_state_command_receipts_key_check"
      CHECK (length("idempotency_key") > 0),
    CONSTRAINT "notification_state_command_receipts_fingerprint_check"
      CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "notification_state_command_receipts_result_check"
      CHECK (jsonb_typeof("result_document") = 'object')
);

CREATE UNIQUE INDEX "notification_state_receipts_idempotency_key"
  ON "dda"."notification_state_command_receipts"(
    "organization_id", "workspace_id", "recipient_id", "notification_id", "idempotency_key"
  );

CREATE INDEX "notification_state_receipts_notification_idx"
  ON "dda"."notification_state_command_receipts"(
    "organization_id", "workspace_id", "recipient_id", "notification_id"
  );
