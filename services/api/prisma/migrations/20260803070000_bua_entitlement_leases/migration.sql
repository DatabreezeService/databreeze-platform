-- BUA-017/018: persist signed offline leases without provider-specific billing state.
CREATE TABLE "bua"."entitlement_leases" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "snapshot_revision" INTEGER NOT NULL,
    "security_epoch" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" VARCHAR(2048) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_leases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entitlement_leases_scope_expiry_idx"
ON "bua"."entitlement_leases"("organization_id", "workspace_id", "expires_at");
