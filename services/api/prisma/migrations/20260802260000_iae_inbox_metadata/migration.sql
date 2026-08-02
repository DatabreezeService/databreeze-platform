ALTER TABLE "iae"."inbox_items"
  ADD COLUMN "assignee_id" UUID,
  ADD COLUMN "labels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "priority" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "due_at" TIMESTAMPTZ(6);
