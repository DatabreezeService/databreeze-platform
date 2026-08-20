from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from databreeze_contracts.v1 import (
    ActorMetadata,
    CommandEnvelope,
    CorrelationMetadata,
    CursorPage,
    DdaAgentGrant,
    DdaAnalysisPlan,
    DdaConversation,
    DdaConversationContextEvent,
    DdaDashboardSnapshot,
    DdaDashboardVersion,
    DdaEtlPlan,
    DdaFolderManifest,
    DdaMaterialization,
    DdaPreparationSummary,
    DdaReceiptCandidate,
    DdaRefreshEvent,
    DdaSourceCatalog,
    DdaStarterDashboardEvent,
    DdaTableExtractionCandidate,
    EventEnvelope,
    Identifier,
    ProblemDetails,
    Revision,
    TenantScope,
    UtcTimestamp,
)
from databreeze_contracts.v2 import DdaReceiptUpload
from databreeze_contracts.v3 import (
  DdaDashboardAuthoringCommand,
  DdaDashboardAuthoringCommandResult,
  DdaDashboardChartProposal,
  DdaDashboardWorkspaceHistory,
  DdaNotification,
  DdaNotificationPage,
  DdaNotificationStateCommand,
  DdaWorkspaceMemberSettings,
)
from databreeze_contracts.v4 import (
    BuaEntitlementSummary,
    BuaPayosCheckoutCommand,
    BuaPayosCheckoutSession,
    BuaPayosPaymentStatus,
    BuaPayosPlanCatalog,
    BuaPayosWebhookEvent,
    CrfReportCreateAccepted,
    CrfReportCreateCommand,
    CrfReportDetailAccepted,
    CrfReportListAccepted,
    CrfReportRunDetailAccepted,
    CrfReportSummary,
    DdaAgentTurnAccepted,
    DdaAgentTurnCommand,
    DdaConversationListAccepted,
    DdaConversationLoadAccepted,
    DdaConversationSummary,
    DdaDashboardWidgetResultsAccepted,
    DdaDataImportDashboardPreview,
    DdaNotificationPreferencesAccepted,
    DdaNotificationPreferencesCommand,
    IamProfileUpdateAccepted,
    IamProfileUpdateCommand,
    IamScopeSwitchCommand,
    IamWorkspaceCreateAccepted,
    IamWorkspaceCreateCommand,
    IamAuthSession,
    IamBootstrapResponse,
    IamEmailVerificationCommand,
    IamPasswordSignInCommand,
    IamRegistrationAccepted,
    IamRegistrationCommand,
    JraJobHistoryDetailAccepted,
    JraJobHistoryEntry,
    JraJobHistoryListAccepted,
    JraWorkerDashboardWidgetResultOutput,
    JraWorkerResultFinalizeAccepted,
    JraWorkerResultFinalizeCommand,
    JraWorkerResultPrepareAccepted,
    JraWorkerResultPrepareCommand,
    LfbLandingFeedbackAccepted,
    LfbLandingFeedbackCommand,
    PlatformAdminFeedbacks,
    PlatformAdminOverview,
)

SCHEMA_BASE = "https://schemas.databreeze.dev/contracts/v1"
SCHEMA_BASE_V2 = "https://schemas.databreeze.dev/contracts/v2"
SCHEMA_BASE_V3 = "https://schemas.databreeze.dev/contracts/v3"
SCHEMA_BASE_V4 = "https://schemas.databreeze.dev/contracts/v4"
ADAPTERS: dict[str, TypeAdapter[Any]] = {
    f"{SCHEMA_BASE}/actor-metadata": TypeAdapter(ActorMetadata),
    f"{SCHEMA_BASE}/command-envelope": TypeAdapter(CommandEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/correlation-metadata": TypeAdapter(CorrelationMetadata),
    f"{SCHEMA_BASE}/cursor-page": TypeAdapter(CursorPage[Any]),
    f"{SCHEMA_BASE}/dda-agent-grant": TypeAdapter(DdaAgentGrant),
    f"{SCHEMA_BASE}/dda-analysis-plan": TypeAdapter(DdaAnalysisPlan),
    f"{SCHEMA_BASE}/dda-conversation": TypeAdapter(DdaConversation),
    f"{SCHEMA_BASE}/dda-conversation-context-event": TypeAdapter(DdaConversationContextEvent),
    f"{SCHEMA_BASE}/dda-dashboard-snapshot": TypeAdapter(DdaDashboardSnapshot),
    f"{SCHEMA_BASE}/dda-dashboard-version": TypeAdapter(DdaDashboardVersion),
    f"{SCHEMA_BASE}/dda-etl-plan": TypeAdapter(DdaEtlPlan),
    f"{SCHEMA_BASE}/dda-folder-manifest": TypeAdapter(DdaFolderManifest),
    f"{SCHEMA_BASE}/dda-materialization": TypeAdapter(DdaMaterialization),
    f"{SCHEMA_BASE}/dda-preparation-summary": TypeAdapter(DdaPreparationSummary),
    f"{SCHEMA_BASE}/dda-receipt-candidate": TypeAdapter(DdaReceiptCandidate),
    f"{SCHEMA_BASE}/dda-refresh-event": TypeAdapter(DdaRefreshEvent),
    f"{SCHEMA_BASE}/dda-source-catalog": TypeAdapter(DdaSourceCatalog),
    f"{SCHEMA_BASE}/dda-starter-dashboard-event": TypeAdapter(DdaStarterDashboardEvent),
    f"{SCHEMA_BASE}/dda-table-extraction-candidate": TypeAdapter(DdaTableExtractionCandidate),
    f"{SCHEMA_BASE}/event-envelope": TypeAdapter(EventEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/identifier": TypeAdapter(Identifier),
    f"{SCHEMA_BASE}/problem-details": TypeAdapter(ProblemDetails),
    f"{SCHEMA_BASE}/revision": TypeAdapter(Revision),
    f"{SCHEMA_BASE}/tenant-scope": TypeAdapter(TenantScope),
    f"{SCHEMA_BASE}/utc-timestamp": TypeAdapter(UtcTimestamp),
    f"{SCHEMA_BASE_V2}/dda-receipt-upload": TypeAdapter(DdaReceiptUpload),
    f"{SCHEMA_BASE_V3}/dda-dashboard-authoring-command": TypeAdapter(DdaDashboardAuthoringCommand),
    f"{SCHEMA_BASE_V3}/dda-dashboard-authoring-command-result": TypeAdapter(DdaDashboardAuthoringCommandResult),
    f"{SCHEMA_BASE_V3}/dda-dashboard-chart-proposal": TypeAdapter(DdaDashboardChartProposal),
    f"{SCHEMA_BASE_V3}/dda-dashboard-workspace-history": TypeAdapter(DdaDashboardWorkspaceHistory),
    f"{SCHEMA_BASE_V3}/dda-notification": TypeAdapter(DdaNotification),
    f"{SCHEMA_BASE_V3}/dda-notification-page": TypeAdapter(DdaNotificationPage),
    f"{SCHEMA_BASE_V3}/dda-notification-state-command": TypeAdapter(DdaNotificationStateCommand),
    f"{SCHEMA_BASE_V3}/dda-workspace-member-settings": TypeAdapter(DdaWorkspaceMemberSettings),
    f"{SCHEMA_BASE_V4}/bua-entitlement-summary": TypeAdapter(BuaEntitlementSummary),
    f"{SCHEMA_BASE_V4}/bua-payos-checkout-command": TypeAdapter(BuaPayosCheckoutCommand),
    f"{SCHEMA_BASE_V4}/bua-payos-checkout-session": TypeAdapter(BuaPayosCheckoutSession),
    f"{SCHEMA_BASE_V4}/bua-payos-payment-status": TypeAdapter(BuaPayosPaymentStatus),
    f"{SCHEMA_BASE_V4}/bua-payos-plan-catalog": TypeAdapter(BuaPayosPlanCatalog),
    f"{SCHEMA_BASE_V4}/bua-payos-webhook-event": TypeAdapter(BuaPayosWebhookEvent),
    f"{SCHEMA_BASE_V4}/crf-report-create-accepted": TypeAdapter(CrfReportCreateAccepted),
    f"{SCHEMA_BASE_V4}/crf-report-create-command": TypeAdapter(CrfReportCreateCommand),
    f"{SCHEMA_BASE_V4}/crf-report-detail-accepted": TypeAdapter(CrfReportDetailAccepted),
    f"{SCHEMA_BASE_V4}/crf-report-list-accepted": TypeAdapter(CrfReportListAccepted),
    f"{SCHEMA_BASE_V4}/crf-report-run-detail-accepted": TypeAdapter(CrfReportRunDetailAccepted),
    f"{SCHEMA_BASE_V4}/crf-report-summary": TypeAdapter(CrfReportSummary),
    f"{SCHEMA_BASE_V4}/dda-agent-turn-accepted": TypeAdapter(DdaAgentTurnAccepted),
    f"{SCHEMA_BASE_V4}/dda-agent-turn-command": TypeAdapter(DdaAgentTurnCommand),
    f"{SCHEMA_BASE_V4}/dda-conversation-list-accepted": TypeAdapter(DdaConversationListAccepted),
    f"{SCHEMA_BASE_V4}/dda-conversation-load-accepted": TypeAdapter(DdaConversationLoadAccepted),
    f"{SCHEMA_BASE_V4}/dda-conversation-summary": TypeAdapter(DdaConversationSummary),
    f"{SCHEMA_BASE_V4}/dda-dashboard-widget-results-accepted": TypeAdapter(DdaDashboardWidgetResultsAccepted),
    f"{SCHEMA_BASE_V4}/dda-data-import-dashboard-preview": TypeAdapter(DdaDataImportDashboardPreview),
    f"{SCHEMA_BASE_V4}/dda-notification-preferences-accepted": TypeAdapter(DdaNotificationPreferencesAccepted),
    f"{SCHEMA_BASE_V4}/dda-notification-preferences-command": TypeAdapter(DdaNotificationPreferencesCommand),
    f"{SCHEMA_BASE_V4}/iam-auth-session": TypeAdapter(IamAuthSession),
    f"{SCHEMA_BASE_V4}/iam-bootstrap-response": TypeAdapter(IamBootstrapResponse),
    f"{SCHEMA_BASE_V4}/iam-email-verification-command": TypeAdapter(IamEmailVerificationCommand),
    f"{SCHEMA_BASE_V4}/iam-password-sign-in-command": TypeAdapter(IamPasswordSignInCommand),
    f"{SCHEMA_BASE_V4}/iam-registration-accepted": TypeAdapter(IamRegistrationAccepted),
    f"{SCHEMA_BASE_V4}/iam-registration-command": TypeAdapter(IamRegistrationCommand),
    f"{SCHEMA_BASE_V4}/iam-profile-update-accepted": TypeAdapter(IamProfileUpdateAccepted),
    f"{SCHEMA_BASE_V4}/iam-profile-update-command": TypeAdapter(IamProfileUpdateCommand),
    f"{SCHEMA_BASE_V4}/iam-scope-switch-command": TypeAdapter(IamScopeSwitchCommand),
    f"{SCHEMA_BASE_V4}/iam-workspace-create-accepted": TypeAdapter(IamWorkspaceCreateAccepted),
    f"{SCHEMA_BASE_V4}/iam-workspace-create-command": TypeAdapter(IamWorkspaceCreateCommand),
    f"{SCHEMA_BASE_V4}/jra-job-history-detail-accepted": TypeAdapter(JraJobHistoryDetailAccepted),
    f"{SCHEMA_BASE_V4}/jra-job-history-entry": TypeAdapter(JraJobHistoryEntry),
    f"{SCHEMA_BASE_V4}/jra-job-history-list-accepted": TypeAdapter(JraJobHistoryListAccepted),
    f"{SCHEMA_BASE_V4}/jra-worker-dashboard-widget-result-output": TypeAdapter(JraWorkerDashboardWidgetResultOutput),
    f"{SCHEMA_BASE_V4}/jra-worker-result-finalize-accepted": TypeAdapter(JraWorkerResultFinalizeAccepted),
    f"{SCHEMA_BASE_V4}/jra-worker-result-finalize-command": TypeAdapter(JraWorkerResultFinalizeCommand),
    f"{SCHEMA_BASE_V4}/jra-worker-result-prepare-accepted": TypeAdapter(JraWorkerResultPrepareAccepted),
    f"{SCHEMA_BASE_V4}/jra-worker-result-prepare-command": TypeAdapter(JraWorkerResultPrepareCommand),
    f"{SCHEMA_BASE_V4}/lfb-landing-feedback-accepted": TypeAdapter(LfbLandingFeedbackAccepted),
    f"{SCHEMA_BASE_V4}/lfb-landing-feedback-command": TypeAdapter(LfbLandingFeedbackCommand),
    f"{SCHEMA_BASE_V4}/platform-admin-feedbacks": TypeAdapter(PlatformAdminFeedbacks),
    f"{SCHEMA_BASE_V4}/platform-admin-overview": TypeAdapter(PlatformAdminOverview),
}


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def accepts_fixture(schema_id: str, payload: Any) -> bool:
    adapter = ADAPTERS.get(schema_id)
    if adapter is None:
        raise ValueError(f"No generated Pydantic model for {schema_id}")
    try:
        adapter.validate_python(payload)
    except ValidationError:
        return False
    return True


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    fixture_manifest_path = arguments.fixture_manifest.resolve()
    fixture_root = fixture_manifest_path.parent
    manifest = read_json(fixture_manifest_path)
    results = []
    for fixture_case in manifest["cases"]:
        payload = read_json(fixture_root / fixture_case["source"])
        results.append(
            {
                "caseId": fixture_case["id"],
                "accepted": accepts_fixture(fixture_case["schemaId"], payload),
            }
        )
    document = {"runtime": "python", "results": results}
    arguments.output.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
