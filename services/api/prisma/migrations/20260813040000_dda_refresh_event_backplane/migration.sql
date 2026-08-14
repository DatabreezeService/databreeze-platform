-- DDA-034/DDA-036 durable multi-instance refresh SSE backplane.
-- Content-safe metadata only: no cell values, source paths, credentials, raw provider data, or result rows.
-- Rollback (after event retention/export review): drop dashboard_refresh_events, then
-- dashboard_refresh_event_sequences.

CREATE TABLE "dda"."dashboard_refresh_event_sequences" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "next_sequence" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "dashboard_refresh_event_sequences_pkey"
      PRIMARY KEY ("organization_id", "workspace_id", "project_id", "dashboard_id")
);

CREATE TABLE "dda"."dashboard_refresh_events" (
    "event_id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "freshness_state" VARCHAR(32) NOT NULL,
    "event_kind" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "authorization_epoch" INTEGER,
    "event_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_refresh_events_pkey" PRIMARY KEY ("event_id")
);

CREATE UNIQUE INDEX "dashboard_refresh_events_scope_sequence_key"
  ON "dda"."dashboard_refresh_events"("organization_id", "workspace_id", "project_id", "dashboard_id", "sequence");

CREATE UNIQUE INDEX "dashboard_refresh_events_scope_hash_key"
  ON "dda"."dashboard_refresh_events"("organization_id", "workspace_id", "project_id", "dashboard_id", "event_hash");

CREATE INDEX "dashboard_refresh_events_scope_occurred_idx"
  ON "dda"."dashboard_refresh_events"("organization_id", "workspace_id", "project_id", "dashboard_id", "occurred_at", "sequence");
