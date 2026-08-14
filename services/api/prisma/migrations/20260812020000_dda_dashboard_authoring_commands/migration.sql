CREATE TABLE "dda"."dashboard_authoring_commands" (
    "command_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL,
    "publishes" BOOLEAN NOT NULL DEFAULT false,
    "result_document" JSONB NOT NULL,

    CONSTRAINT "dashboard_authoring_commands_pkey" PRIMARY KEY ("organization_id", "workspace_id", "project_id", "command_id")
);

CREATE INDEX "dashboard_authoring_commands_scope_dashboard_idx"
    ON "dda"."dashboard_authoring_commands"("organization_id", "workspace_id", "project_id", "dashboard_id");

CREATE INDEX "dashboard_authoring_commands_scope_revision_idx"
    ON "dda"."dashboard_authoring_commands"("organization_id", "workspace_id", "project_id", "revision");
