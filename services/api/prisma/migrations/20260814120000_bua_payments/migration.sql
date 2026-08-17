-- BUA payment durability: provider orders, webhook inbox, subscription/invoice projections,
-- and append-only payment audit evidence. All rows materialize the authenticated tenant scope.
CREATE TABLE "bua"."payment_orders" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "provider_order_code" BIGINT NOT NULL,
  "scope_key" VARCHAR(200) NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "actor_id" UUID NOT NULL,
  "security_epoch" INTEGER NOT NULL,
  "plan_id" VARCHAR(64) NOT NULL,
  "amount_vnd" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" VARCHAR(24) NOT NULL,
  "checkout_url" TEXT,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "failure_code" VARCHAR(80),
  "paid_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_orders_provider_order_key" ON "bua"."payment_orders" ("provider", "provider_order_code");
CREATE UNIQUE INDEX "payment_orders_scope_idempotency_key" ON "bua"."payment_orders" ("scope_key", "idempotency_key");
CREATE INDEX "payment_orders_scope_status_idx" ON "bua"."payment_orders" ("organization_id", "workspace_id", "status", "created_at");
CREATE INDEX "payment_orders_scope_order_idx" ON "bua"."payment_orders" ("scope_key", "provider_order_code");

CREATE TABLE "bua"."payment_webhook_inbox" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "provider_event_id" VARCHAR(256) NOT NULL,
  "provider_order_code" BIGINT,
  "amount_vnd" INTEGER,
  "status_from_provider" VARCHAR(32),
  "signature" VARCHAR(512) NOT NULL,
  "payload" JSONB NOT NULL,
  "state" VARCHAR(24) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(160),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_inbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_inbox_provider_event_key" ON "bua"."payment_webhook_inbox" ("provider", "provider_event_id");
CREATE INDEX "payment_webhook_inbox_order_state_idx" ON "bua"."payment_webhook_inbox" ("provider", "provider_order_code", "state");
CREATE INDEX "payment_webhook_inbox_state_idx" ON "bua"."payment_webhook_inbox" ("state", "received_at");

CREATE TABLE "bua"."subscriptions" (
  "id" UUID NOT NULL,
  "scope_key" VARCHAR(200) NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "plan_id" VARCHAR(64) NOT NULL,
  "source" VARCHAR(32) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "current_order_id" UUID,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_scope_key" ON "bua"."subscriptions" ("scope_key");
CREATE INDEX "subscriptions_scope_status_idx" ON "bua"."subscriptions" ("organization_id", "workspace_id", "status");

CREATE TABLE "bua"."invoices" (
  "id" UUID NOT NULL,
  "payment_order_id" UUID NOT NULL,
  "scope_key" VARCHAR(200) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "plan_id" VARCHAR(64) NOT NULL,
  "amount_vnd" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" VARCHAR(24) NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_payment_order_key" ON "bua"."invoices" ("payment_order_id");
CREATE INDEX "invoices_scope_issued_idx" ON "bua"."invoices" ("organization_id", "workspace_id", "issued_at");

CREATE TABLE "bua"."payment_audit_events" (
  "id" UUID NOT NULL,
  "payment_order_id" UUID NOT NULL,
  "scope_key" VARCHAR(200) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "actor_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_audit_order_action_key" ON "bua"."payment_audit_events" ("payment_order_id", "action");
CREATE INDEX "payment_audit_scope_created_idx" ON "bua"."payment_audit_events" ("organization_id", "workspace_id", "created_at");
