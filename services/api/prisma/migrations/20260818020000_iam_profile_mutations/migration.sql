ALTER TABLE "iam"."users"
  ADD COLUMN IF NOT EXISTS "profile_revision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "iam"."profile_mutation_receipts" (
  "user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "display_name" VARCHAR(200) NOT NULL,
  "locale" VARCHAR(16) NOT NULL,
  "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_mutation_receipts_pkey" PRIMARY KEY ("user_id", "idempotency_key"),
  CONSTRAINT "profile_mutation_receipts_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "profile_mutation_receipts_hash_ck" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "profile_mutation_receipts_locale_ck" CHECK ("locale" IN ('vi-VN', 'en')),
  CONSTRAINT "profile_mutation_receipts_revision_ck" CHECK ("revision" >= 1)
);

CREATE INDEX IF NOT EXISTS "profile_mutation_receipts_user_created_idx"
  ON "iam"."profile_mutation_receipts" ("user_id", "created_at");
