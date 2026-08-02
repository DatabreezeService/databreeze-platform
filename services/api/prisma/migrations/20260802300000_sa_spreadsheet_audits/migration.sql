-- SA-001..SA-006: persist immutable value-free spreadsheet audit metadata.
CREATE SCHEMA IF NOT EXISTS "sa";

CREATE TABLE "sa"."spreadsheet_audit_results" (
    "id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "workbook_sha256" CHAR(64) NOT NULL,
    "sheets" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "blocked_reasons" JSONB NOT NULL,
    "processor_version" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spreadsheet_audit_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spreadsheet_audits_artifact_version_idx"
    ON "sa"."spreadsheet_audit_results"("artifact_version_id");
CREATE INDEX "spreadsheet_audits_scope_idx"
    ON "sa"."spreadsheet_audit_results"("organization_id", "workspace_id", "project_id", "artifact_version_id");
