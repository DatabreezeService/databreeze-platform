-- IAM-026: internal platform operators are explicitly assigned and remain
-- independent from organization/workspace/project memberships.
CREATE TABLE "iam"."platform_operators" (
  "user_id" UUID NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "assigned_by" UUID,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "platform_operators_role_check" CHECK ("role" IN ('PLATFORM_OWNER', 'PLATFORM_SUPPORT')),
  CONSTRAINT "platform_operators_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT "platform_operators_revocation_check" CHECK (
    ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL) OR
    ("status" <> 'REVOKED')
  )
);

CREATE INDEX "platform_operators_status_role_idx"
  ON "iam"."platform_operators" ("status", "role");
