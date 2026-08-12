-- IAM-022..025 / DDA-052..059 unified workspace durable metadata.
-- Metadata only — digests and opaque IAE/DSM references; no OTP codes, refresh tokens,
-- provider tokens, local paths, OCR text, or source content.
-- ROLLBACK (empty/unpublished only): drop new tables in reverse order.
-- Never delete IAE content or AUD history.

CREATE TABLE "iam"."email_verification_challenges" (
    "id" UUID NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "admission_digest" CHAR(64) NOT NULL,
    "code_digest" CHAR(64) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_challenges_admission_purpose_idx"
  ON "iam"."email_verification_challenges"("admission_digest", "purpose", "status");
CREATE INDEX "email_verification_challenges_expiry_status_idx"
  ON "iam"."email_verification_challenges"("expires_at", "status");
CREATE UNIQUE INDEX "email_verification_challenges_active_purpose_key"
  ON "iam"."email_verification_challenges"("admission_digest", "purpose")
  WHERE ("status" = 'ACTIVE');

CREATE TABLE "iam"."oidc_identity_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "issuer" VARCHAR(256) NOT NULL,
    "subject_digest" CHAR(64) NOT NULL,
    "email_digest" CHAR(64) NOT NULL,
    "email_verified_at_link" BOOLEAN NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oidc_identity_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oidc_identity_links_issuer_subject_key" UNIQUE ("issuer", "subject_digest")
);

CREATE INDEX "oidc_identity_links_user_idx"
  ON "iam"."oidc_identity_links"("user_id", "revoked_at");

CREATE TABLE "iam"."workspace_agent_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "level" VARCHAR(32) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_agent_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_agent_grants_member_key" UNIQUE ("organization_id", "workspace_id", "member_id"),
    CONSTRAINT "workspace_agent_grants_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id"),
    CONSTRAINT "workspace_agent_grants_level_check"
      CHECK ("level" IN ('NONE', 'ANALYZE', 'PROPOSE_CHANGES', 'APPLY_CONFIRMED_CHANGES'))
);

CREATE INDEX "workspace_agent_grants_workspace_updated_idx"
  ON "iam"."workspace_agent_grants"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."dataset_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "dsm_dataset_id" UUID NOT NULL,
    "iae_artifact_version_id" UUID NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "safe_display_label" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "health" VARCHAR(32) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dataset_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dataset_sources_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id")
);

CREATE INDEX "dataset_sources_workspace_updated_idx"
  ON "dda"."dataset_sources"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."source_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "source_id" UUID NOT NULL,
    "dsm_dataset_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "source_assignments_source_dataset_key"
      UNIQUE ("organization_id", "workspace_id", "source_id", "dsm_dataset_id"),
    CONSTRAINT "source_assignments_source_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "source_id")
      REFERENCES "dda"."dataset_sources"("organization_id", "workspace_id", "id")
);

CREATE INDEX "source_assignments_workspace_updated_idx"
  ON "dda"."source_assignments"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."folder_placement_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "source_id" UUID NOT NULL,
    "decision" VARCHAR(32) NOT NULL,
    "reason_code" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "folder_placement_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "folder_placement_reviews_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id")
);

CREATE INDEX "folder_placement_reviews_workspace_updated_idx"
  ON "dda"."folder_placement_reviews"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."folder_move_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "review_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "receipt_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_move_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "folder_move_receipts_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id"),
    CONSTRAINT "folder_move_receipts_review_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "review_id")
      REFERENCES "dda"."folder_placement_reviews"("organization_id", "workspace_id", "id")
);

CREATE INDEX "folder_move_receipts_workspace_occurred_idx"
  ON "dda"."folder_move_receipts"("organization_id", "workspace_id", "occurred_at", "id");

CREATE TABLE "dda"."conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "retention_state" VARCHAR(32) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id"),
    CONSTRAINT "conversations_retention_state_check"
      CHECK ("retention_state" IN ('ACTIVE', 'PENDING_DELETE', 'DELETED'))
);

CREATE INDEX "conversations_workspace_updated_idx"
  ON "dda"."conversations"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."conversation_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "text_digest" CHAR(64) NOT NULL,
    "text_length" INTEGER NOT NULL,
    "dataset_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_messages_workspace_idempotency_key"
      UNIQUE ("organization_id", "workspace_id", "idempotency_key"),
    CONSTRAINT "conversation_messages_conversation_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "conversation_id")
      REFERENCES "dda"."conversations"("organization_id", "workspace_id", "id")
);

CREATE INDEX "conversation_messages_thread_idx"
  ON "dda"."conversation_messages"("organization_id", "workspace_id", "conversation_id", "created_at", "id");

CREATE TABLE "dda"."conversation_context_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "before_version_id" UUID,
    "after_version_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_context_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_context_events_conversation_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "conversation_id")
      REFERENCES "dda"."conversations"("organization_id", "workspace_id", "id")
);

CREATE INDEX "conversation_context_events_thread_idx"
  ON "dda"."conversation_context_events"("organization_id", "workspace_id", "conversation_id", "occurred_at", "id");

CREATE TABLE "dda"."conversation_summaries" (
    "conversation_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "summary_digest" CHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("conversation_id"),
    CONSTRAINT "conversation_summaries_scope_key"
      UNIQUE ("organization_id", "workspace_id", "conversation_id"),
    CONSTRAINT "conversation_summaries_conversation_scope_fkey"
      FOREIGN KEY ("organization_id", "workspace_id", "conversation_id")
      REFERENCES "dda"."conversations"("organization_id", "workspace_id", "id")
);

CREATE TABLE "dda"."extraction_candidates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "iae_artifact_version_id" UUID NOT NULL,
    "profile_version" VARCHAR(32) NOT NULL,
    "candidate_hash" CHAR(64) NOT NULL,
    "page_count" INTEGER NOT NULL,
    "column_count" INTEGER NOT NULL,
    "cell_count" INTEGER NOT NULL,
    "evidence_reference_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extraction_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "extraction_candidates_scope_id_key" UNIQUE ("organization_id", "workspace_id", "id")
);

CREATE INDEX "extraction_candidates_workspace_updated_idx"
  ON "dda"."extraction_candidates"("organization_id", "workspace_id", "updated_at", "id");

CREATE TABLE "dda"."named_dashboard_views" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "dashboard_version_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "filter_document" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "named_dashboard_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "named_dashboard_views_name_key"
      UNIQUE ("organization_id", "workspace_id", "project_id", "dashboard_id", "name")
);

CREATE INDEX "named_dashboard_views_workspace_updated_idx"
  ON "dda"."named_dashboard_views"("organization_id", "workspace_id", "updated_at", "id");
