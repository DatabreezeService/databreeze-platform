-- BUA-008/IAM-009: preserve exact project ancestry for project-scoped quota usage.
ALTER TABLE "bua"."usage_ledger_entries"
    ADD COLUMN "project_id" UUID;

ALTER TABLE "bua"."usage_reservations"
    ADD COLUMN "project_id" UUID;

DROP INDEX "bua"."usage_ledger_scope_idx";
CREATE INDEX "usage_ledger_scope_idx"
    ON "bua"."usage_ledger_entries"("organization_id", "workspace_id", "project_id", "metric", "sequence");

DROP INDEX "bua"."usage_reservations_scope_idx";
CREATE INDEX "usage_reservations_scope_idx"
    ON "bua"."usage_reservations"("organization_id", "workspace_id", "project_id", "status");
