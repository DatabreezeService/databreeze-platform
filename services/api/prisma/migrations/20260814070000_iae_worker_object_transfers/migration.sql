-- IAE-002, IAE-008, JRA-023: bind worker object transfers to verified content metadata.
-- Existing short-lived capabilities are revoked during the expand migration because their
-- signatures did not bind content length and hash.
ALTER TABLE "iae"."worker_object_capability_records"
    ADD COLUMN "object_bindings" JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN "content_sha256" CHAR(64),
    ADD COLUMN "content_length" BIGINT,
    ADD COLUMN "transferred_at" TIMESTAMPTZ(6);

UPDATE "iae"."worker_object_capability_records"
SET "object_bindings" = (
        SELECT COALESCE(
            jsonb_agg(jsonb_build_object('objectId', object_id.value)),
            '[]'::JSONB
        )
        FROM jsonb_array_elements_text("object_ids") AS object_id(value)
    ),
    "revoked_at" = COALESCE("revoked_at", NOW());

ALTER TABLE "iae"."worker_object_capability_records"
    ALTER COLUMN "object_bindings" DROP DEFAULT,
    ADD CONSTRAINT "worker_object_capability_records_transfer_receipt_check"
    CHECK (
        ("content_sha256" IS NULL AND "content_length" IS NULL AND "transferred_at" IS NULL) OR
        (
            "grant_type" = 'JOB_OUTPUT' AND
            "content_sha256" ~ '^[a-f0-9]{64}$' AND
            "content_length" >= 0 AND
            "content_length" <= "max_bytes" AND
            "transferred_at" IS NOT NULL
        )
    );
