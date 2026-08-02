-- DSO-014, DSO-017: durable monotonic change positions for scope-bound cursors.
CREATE SEQUENCE IF NOT EXISTS "dso"."device_sync_operations_sync_sequence_seq";

ALTER TABLE "dso"."device_sync_operations"
  ADD COLUMN "sync_sequence" INTEGER;

UPDATE "dso"."device_sync_operations"
SET "sync_sequence" = nextval('"dso"."device_sync_operations_sync_sequence_seq"');

ALTER TABLE "dso"."device_sync_operations"
  ALTER COLUMN "sync_sequence" SET DEFAULT nextval('"dso"."device_sync_operations_sync_sequence_seq"'),
  ALTER COLUMN "sync_sequence" SET NOT NULL;

CREATE UNIQUE INDEX "device_sync_operations_sync_sequence_key"
  ON "dso"."device_sync_operations"("sync_sequence");
CREATE INDEX "device_sync_operations_org_sequence_idx"
  ON "dso"."device_sync_operations"("organization_id", "sync_sequence");
