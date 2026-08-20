-- CRF-001..CRF-020: durable, exact-scope report definitions and frozen run projections.
-- Cross-feature IDs are opaque; CRF never stores source bytes or storage URLs.
CREATE SCHEMA IF NOT EXISTS "crf";

INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('crf', 'CRF')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "crf"."report_definitions" (
  "id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "scope_key" VARCHAR(160) NOT NULL,
  "client_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "period" VARCHAR(64) NOT NULL,
  "dataset_id" UUID NOT NULL,
  "dataset_version_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "template_version" INTEGER NOT NULL,
  "supported_formats" JSONB NOT NULL,
  "blocks" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "report_version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "canonical_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_definitions_scope_key" UNIQUE ("organization_id", "workspace_id", "project_id", "id"),
  CONSTRAINT "report_definitions_scope_idempotency_key" UNIQUE ("organization_id", "workspace_id", "project_id", "idempotency_key"),
  CONSTRAINT "report_definitions_scope_key_idempotency_key" UNIQUE ("scope_key", "idempotency_key"),
  CONSTRAINT "report_definitions_version_check" CHECK ("report_version" >= 1),
  CONSTRAINT "report_definitions_template_version_check" CHECK ("template_version" >= 1),
  CONSTRAINT "report_definitions_status_check" CHECK ("status" IN ('DRAFT', 'RUNNING', 'REVIEW', 'RELEASED', 'WITHDRAWN', 'BLOCKED'))
);
CREATE INDEX "crf_report_definitions_scope_updated_idx"
  ON "crf"."report_definitions" ("organization_id", "workspace_id", "project_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "crf_report_definitions_dataset_idx"
  ON "crf"."report_definitions" ("organization_id", "workspace_id", "project_id", "dataset_version_id");

CREATE TABLE "crf"."report_runs" (
  "id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "report_version" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "manifest" JSONB,
  "jra_job_id" UUID,
  "result_manifest_id" UUID,
  "content_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_runs_definition_version_key" UNIQUE ("definition_id", "report_version"),
  CONSTRAINT "report_runs_scope_key" UNIQUE ("organization_id", "workspace_id", "project_id", "id"),
  CONSTRAINT "report_runs_version_check" CHECK ("report_version" >= 1),
  CONSTRAINT "report_runs_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'BLOCKED', 'REVIEW', 'RELEASED', 'FAILED'))
);
CREATE INDEX "crf_report_runs_scope_created_idx"
  ON "crf"."report_runs" ("organization_id", "workspace_id", "project_id", "created_at" DESC, "id" DESC);
CREATE INDEX "crf_report_runs_definition_created_idx"
  ON "crf"."report_runs" ("definition_id", "created_at" DESC);

CREATE TABLE "crf"."report_outputs" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "format" VARCHAR(8) NOT NULL,
  "state" VARCHAR(24) NOT NULL,
  "content_hash" CHAR(64),
  "artifact_version_id" UUID,
  "failure_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_outputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_outputs_run_format_key" UNIQUE ("run_id", "format"),
  CONSTRAINT "report_outputs_format_check" CHECK ("format" IN ('DOCX', 'PPTX', 'XLSX', 'PDF', 'WEB')),
  CONSTRAINT "report_outputs_state_check" CHECK ("state" IN ('PENDING', 'READY', 'FAILED', 'WITHDRAWN'))
);
CREATE INDEX "crf_report_outputs_scope_run_idx"
  ON "crf"."report_outputs" ("organization_id", "workspace_id", "project_id", "run_id");

CREATE TABLE "crf"."report_evidence" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL,
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID,
  "project_id" UUID,
  "fact_id" VARCHAR(128) NOT NULL,
  "source_id" UUID NOT NULL,
  "locator" VARCHAR(256) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_evidence_fact_source_key" UNIQUE ("run_id", "fact_id", "source_id", "locator")
);
CREATE INDEX "crf_report_evidence_scope_run_idx"
  ON "crf"."report_evidence" ("organization_id", "workspace_id", "project_id", "run_id");
