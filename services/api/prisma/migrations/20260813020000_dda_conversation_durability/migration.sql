-- DDA-055/DDA-056 durable conversation payloads, scoped idempotency, and ordering.
-- Additive only: the original unified-workspace migration remains immutable.
-- Metadata remains bounded; dataset/source content is referenced by opaque IDs only.

ALTER TABLE "dda"."conversations"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "active_dataset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "active_dataset_version_ids" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "dashboard_id" UUID,
  ADD COLUMN "filter_context" VARCHAR(4000),
  ADD COLUMN "retention_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "next_sequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "create_idempotency_scope_key" VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN "create_idempotency_key" VARCHAR(200) NOT NULL DEFAULT '',
  -- Legacy rows use the zero digest marker; the adapter accepts this marker
  -- only with the matching legacy:<conversation-id> idempotency key.
  ADD COLUMN "create_request_fingerprint" CHAR(64) NOT NULL DEFAULT repeat('0', 64);

UPDATE "dda"."conversations"
SET "scope_type" = CASE WHEN "project_id" IS NULL THEN 'workspace' ELSE 'project' END,
    "create_idempotency_scope_key" = CASE
      WHEN "project_id" IS NULL THEN 'workspace:' || "organization_id"::text || ':' || "workspace_id"::text
      ELSE 'project:' || "organization_id"::text || ':' || "workspace_id"::text || ':' || "project_id"::text
    END,
    "create_idempotency_key" = 'legacy:' || "id"::text,
    "create_request_fingerprint" = repeat('0', 64);

ALTER TABLE "dda"."conversations"
  ALTER COLUMN "scope_type" DROP DEFAULT,
  ALTER COLUMN "active_dataset_ids" DROP DEFAULT,
  ALTER COLUMN "active_dataset_version_ids" DROP DEFAULT,
  ALTER COLUMN "retention_hold" DROP DEFAULT,
  ALTER COLUMN "next_sequence" DROP DEFAULT,
  ALTER COLUMN "create_idempotency_scope_key" DROP DEFAULT,
  ALTER COLUMN "create_idempotency_key" DROP DEFAULT,
  ALTER COLUMN "create_request_fingerprint" DROP DEFAULT;

ALTER TABLE "dda"."conversations"
  ADD CONSTRAINT "conversations_create_idempotency_key"
    UNIQUE ("organization_id", "workspace_id", "scope_type", "create_idempotency_scope_key", "create_idempotency_key");

CREATE INDEX "conversations_scope_updated_idx"
  ON "dda"."conversations"("organization_id", "workspace_id", "scope_type", "project_id", "updated_at", "id");

ALTER TABLE "dda"."conversation_messages"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "request_fingerprint" CHAR(64) NOT NULL DEFAULT repeat('0', 64),
  ADD COLUMN "text" VARCHAR(8000) NOT NULL DEFAULT '';

UPDATE "dda"."conversation_messages" AS message
SET "scope_type" = conversation."scope_type",
    "project_id" = conversation."project_id"
FROM "dda"."conversations" AS conversation
WHERE conversation."organization_id" = message."organization_id"
  AND conversation."workspace_id" = message."workspace_id"
  AND conversation."id" = message."conversation_id";

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organization_id", "workspace_id", "conversation_id"
    ORDER BY "created_at" ASC, "id" ASC
  )::integer AS next_sequence
  FROM "dda"."conversation_messages"
)
UPDATE "dda"."conversation_messages" AS message
SET "sequence" = ranked.next_sequence
FROM ranked
WHERE ranked."id" = message."id";

ALTER TABLE "dda"."conversation_messages"
  ALTER COLUMN "scope_type" DROP DEFAULT,
  ALTER COLUMN "sequence" DROP DEFAULT,
  ALTER COLUMN "request_fingerprint" DROP DEFAULT,
  ALTER COLUMN "text" DROP DEFAULT,
  DROP CONSTRAINT "conversation_messages_workspace_idempotency_key";

ALTER TABLE "dda"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_conversation_idempotency_key"
    UNIQUE ("organization_id", "workspace_id", "conversation_id", "idempotency_key"),
  ADD CONSTRAINT "conversation_messages_conversation_sequence_key"
    UNIQUE ("organization_id", "workspace_id", "conversation_id", "sequence");

CREATE INDEX "conversation_messages_scope_sequence_idx"
  ON "dda"."conversation_messages"("organization_id", "workspace_id", "scope_type", "project_id", "conversation_id", "sequence");

ALTER TABLE "dda"."conversation_context_events"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dataset_id" UUID,
  ADD COLUMN "idempotency_scope_key" VARCHAR(200),
  ADD COLUMN "idempotency_key" VARCHAR(200),
  ADD COLUMN "request_fingerprint" CHAR(64);

UPDATE "dda"."conversation_context_events" AS event
SET "scope_type" = conversation."scope_type",
    "project_id" = conversation."project_id"
FROM "dda"."conversations" AS conversation
WHERE conversation."organization_id" = event."organization_id"
  AND conversation."workspace_id" = event."workspace_id"
  AND conversation."id" = event."conversation_id";

WITH message_counts AS (
  SELECT "organization_id", "workspace_id", "conversation_id", COUNT(*)::integer AS message_count
  FROM "dda"."conversation_messages"
  GROUP BY "organization_id", "workspace_id", "conversation_id"
), ranked AS (
  SELECT event."id",
         (ROW_NUMBER() OVER (
           PARTITION BY event."organization_id", event."workspace_id", event."conversation_id"
           ORDER BY event."occurred_at" ASC, event."id" ASC
         ) + COALESCE(message_counts.message_count, 0))::integer AS next_sequence
  FROM "dda"."conversation_context_events" AS event
  LEFT JOIN message_counts
    ON message_counts."organization_id" = event."organization_id"
   AND message_counts."workspace_id" = event."workspace_id"
   AND message_counts."conversation_id" = event."conversation_id"
)
UPDATE "dda"."conversation_context_events" AS event
SET "sequence" = ranked.next_sequence
FROM ranked
WHERE ranked."id" = event."id";

UPDATE "dda"."conversations" AS conversation
SET "next_sequence" = GREATEST(
  1,
  COALESCE((
    SELECT MAX("sequence") + 1
    FROM "dda"."conversation_messages" AS message
    WHERE message."organization_id" = conversation."organization_id"
      AND message."workspace_id" = conversation."workspace_id"
      AND message."conversation_id" = conversation."id"
  ), 1),
  COALESCE((
    SELECT MAX("sequence") + 1
    FROM "dda"."conversation_context_events" AS event
    WHERE event."organization_id" = conversation."organization_id"
      AND event."workspace_id" = conversation."workspace_id"
      AND event."conversation_id" = conversation."id"
  ), 1)
);

ALTER TABLE "dda"."conversation_context_events"
  ALTER COLUMN "scope_type" DROP DEFAULT,
  ALTER COLUMN "sequence" DROP DEFAULT;

ALTER TABLE "dda"."conversation_context_events"
  ADD CONSTRAINT "conversation_context_events_conversation_sequence_key"
    UNIQUE ("organization_id", "workspace_id", "conversation_id", "sequence");

ALTER TABLE "dda"."conversation_context_events"
  ADD CONSTRAINT "conversation_context_events_idempotency_key"
    UNIQUE ("organization_id", "workspace_id", "scope_type", "project_id", "conversation_id", "idempotency_key");

CREATE INDEX "conversation_context_events_scope_sequence_idx"
  ON "dda"."conversation_context_events"("organization_id", "workspace_id", "scope_type", "project_id", "conversation_id", "sequence");

ALTER TABLE "dda"."conversation_summaries"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "text" VARCHAR(8000) NOT NULL DEFAULT '';

UPDATE "dda"."conversation_summaries" AS summary
SET "scope_type" = conversation."scope_type",
    "project_id" = conversation."project_id"
FROM "dda"."conversations" AS conversation
WHERE conversation."organization_id" = summary."organization_id"
  AND conversation."workspace_id" = summary."workspace_id"
  AND conversation."id" = summary."conversation_id";

ALTER TABLE "dda"."conversation_summaries"
  ALTER COLUMN "scope_type" DROP DEFAULT,
  ALTER COLUMN "text" DROP DEFAULT;

CREATE INDEX "conversation_summaries_scope_idx"
  ON "dda"."conversation_summaries"("organization_id", "workspace_id", "scope_type", "project_id", "conversation_id");
