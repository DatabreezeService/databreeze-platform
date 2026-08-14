-- NCO-001/NCO-003/NCO-012/NCO-020: durable recipient-scoped notification intents.
-- Only opaque identifiers, safe labels, state, and bounded event metadata are stored.
-- Source content, OCR values, evidence, credentials, and paths are intentionally absent.
-- The later 20260814030000 migration adds bundle merge, delivery receipts,
-- projection checkpoints, and durable state-command receipts.
--
-- Rollback: disable notification projection and read-state writes, preserve the
-- committed-event source and audit history, then remove only this additive table
-- in a reviewed migration. Do not delete source data or domain event history.

CREATE TABLE "dda"."notification_intents" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_hash" CHAR(64) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "label_vi" VARCHAR(160) NOT NULL,
    "label_en" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "last_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'UNREAD',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "dismissed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_intents_event_hash_check"
      CHECK ("event_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "notification_intents_kind_check"
      CHECK ("kind" IN (
        'REVIEW_REQUIRED', 'PREPARATION_BLOCKED', 'SOURCE_MISMATCH',
        'SYNC_FAILED', 'REFRESH_BLOCKED', 'OCR_REVIEW_REQUIRED',
        'AGENT_BUDGET_DENIED', 'SECURITY_NOTICE'
      )),
    CONSTRAINT "notification_intents_action_check"
      CHECK ("action" IN (
        'OPEN_DASHBOARDS', 'OPEN_ANALYSIS', 'OPEN_DATA',
        'OPEN_INBOX', 'OPEN_SETTINGS'
      )),
    CONSTRAINT "notification_intents_state_check"
      CHECK ("state" IN ('UNREAD', 'READ', 'ARCHIVED', 'DISMISSED')),
    CONSTRAINT "notification_intents_revision_check"
      CHECK ("revision" > 0),
    CONSTRAINT "notification_intents_occurrence_check"
      CHECK ("occurrence_count" > 0),
    CONSTRAINT "notification_intents_label_check"
      CHECK (
        length("label_vi") > 0 AND length("label_en") > 0
        AND "label_vi" !~ '[[:cntrl:]]'
        AND "label_en" !~ '[[:cntrl:]]'
        AND "label_vi" !~* '(https?://|[A-Za-z]:[/\\\\]|\\\\|password|passwd|secret|credential|api[-_ ]?key|access[-_ ]?token|provider|openai|anthropic)'
        AND "label_en" !~* '(https?://|[A-Za-z]:[/\\\\]|\\\\|password|passwd|secret|credential|api[-_ ]?key|access[-_ ]?token|provider|openai|anthropic)'
      ),
    CONSTRAINT "notification_intents_dismissed_state_check"
      CHECK (("state" = 'DISMISSED') = ("dismissed_at" IS NOT NULL)),
    CONSTRAINT "notification_intents_occurrence_order_check"
      CHECK ("first_occurred_at" <= "last_occurred_at")
);

CREATE UNIQUE INDEX "notification_intents_recipient_event_key"
  ON "dda"."notification_intents"(
    "organization_id", "workspace_id", "recipient_id", "event_id"
  );

CREATE UNIQUE INDEX "notification_intents_recipient_id_key"
  ON "dda"."notification_intents"(
    "organization_id", "workspace_id", "recipient_id", "id"
  );

CREATE INDEX "notification_intents_recipient_cursor_idx"
  ON "dda"."notification_intents"(
    "organization_id", "workspace_id", "recipient_id", "created_at" DESC, "id" DESC
  );

CREATE INDEX "notification_intents_recipient_state_idx"
  ON "dda"."notification_intents"(
    "organization_id", "workspace_id", "recipient_id", "state"
  );
