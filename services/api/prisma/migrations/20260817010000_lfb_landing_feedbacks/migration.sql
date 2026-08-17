-- WEB-026: anonymous landing feedback from the public marketing site. Public
-- marketing data: no tenant scope, no artifacts, no raw network identifiers.
CREATE SCHEMA IF NOT EXISTS "lfb";

INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('lfb', 'LFB')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "lfb"."landing_feedbacks" (
  "id" UUID NOT NULL,
  "email" VARCHAR(160) NOT NULL,
  "name" VARCHAR(80),
  "organization" VARCHAR(120),
  "role" VARCHAR(24) NOT NULL,
  "experience" VARCHAR(16) NOT NULL,
  "category" VARCHAR(24) NOT NULL,
  "rating" INTEGER NOT NULL,
  "message" VARCHAR(1200) NOT NULL,
  "contact_permission" BOOLEAN NOT NULL,
  "source_ip_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landing_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "landing_feedbacks_role_check" CHECK ("role" IN ('owner', 'analyst', 'accounting', 'operations', 'technology', 'other')),
  CONSTRAINT "landing_feedbacks_experience_check" CHECK ("experience" IN ('exploring', 'trial', 'active')),
  CONSTRAINT "landing_feedbacks_category_check" CHECK ("category" IN ('product', 'feature', 'data-trust', 'design', 'performance', 'other')),
  CONSTRAINT "landing_feedbacks_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5),
  CONSTRAINT "landing_feedbacks_message_check" CHECK (char_length("message") >= 10)
);

CREATE INDEX "landing_feedbacks_created_at_idx"
  ON "lfb"."landing_feedbacks" ("created_at" DESC);
CREATE INDEX "landing_feedbacks_email_idx"
  ON "lfb"."landing_feedbacks" ("email");
