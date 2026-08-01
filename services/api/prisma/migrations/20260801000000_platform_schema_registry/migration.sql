CREATE SCHEMA IF NOT EXISTS "platform";
CREATE SCHEMA IF NOT EXISTS "system";

CREATE TABLE "platform"."schema_registry" (
    "schema_name" VARCHAR(63) NOT NULL,
    "owner_module" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_registry_pkey" PRIMARY KEY ("schema_name")
);
