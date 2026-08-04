-- IAM-013/INT-004: bound replayable create envelopes and preserve create-time state.
ALTER TABLE "iam"."service_accounts"
    ADD COLUMN "create_idempotency_expires_at" TIMESTAMPTZ(6),
    ADD COLUMN "create_account_snapshot" TEXT;

-- The composite unique index already covers non-null workspace identities. Keep the
-- organization partial index for NULL workspace rows, but remove the redundant copy.
DROP INDEX IF EXISTS "service_accounts_create_idempotency_workspace_key";
