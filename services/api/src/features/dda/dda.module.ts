import { type DynamicModule, Module } from '@nestjs/common';

import type { DdaDatabaseClientV1 } from './adapter/dda-database.client.js';
import { PrismaAgentConsequentialCommandAdapter } from './agent/adapter/prisma-agent-consequential-command.adapter.js';
import {
  BuaAgentUsageAdapter,
  type AgentUsageAdmissionPortV1,
  type AgentUsageAdmissionResolverPortV1,
} from './agent/adapter/bua-agent-usage.adapter.js';
import { createProductionAgentProvider } from '../../platform/agent-production.composition.js';
import {
  createFailClosedAnalysisAdapterV1,
  createFailClosedDashboardAuthorizationV1,
  createFailClosedDeterministicResultsV1,
  createFailClosedEtlPortsV1,
  createFailClosedIntakeIaeV1,
  createFailClosedReceiptRecordsV1,
  createFailClosedRefreshUsageV1,
} from './adapter/fail-closed-etl.adapters.js';
import {
  createFailClosedDdaAuditPortV1,
  createFailClosedDdaFoundationPortsV1,
} from './adapter/fail-closed-foundation.adapters.js';
import { InMemoryAnalysisPlanRepositoryAdapter } from './adapter/in-memory-analysis-plan-repository.adapter.js';
import { InMemoryDashboardRepositoryAdapter } from './adapter/in-memory-dashboard-repository.adapter.js';
import { InMemoryRefreshRepositoryAdapter } from './adapter/in-memory-refresh-repository.adapter.js';
import { PrismaAnalysisPlanRepositoryAdapter } from './adapter/prisma-analysis-plan-repository.adapter.js';
import { PrismaDashboardRepositoryAdapter } from './adapter/prisma-dashboard-repository.adapter.js';
import { PrismaRefreshRepositoryAdapter } from './adapter/prisma-refresh-repository.adapter.js';
import { PrismaDashboardDraftRepositoryAdapter } from './dashboard/adapter/prisma-dashboard-draft-repository.adapter.js';
import { InMemoryDashboardWorkspaceHistoryAdapter } from './dashboard/adapter/in-memory-dashboard-workspace-history.adapter.js';
import { PrismaDashboardWorkspaceHistoryAdapter } from './dashboard/adapter/prisma-dashboard-workspace-history.adapter.js';
import { InMemoryDashboardProposalRepositoryAdapter } from './dashboard/adapter/in-memory-dashboard-proposal-repository.adapter.js';
import {
  OpenAiDashboardProposalAdapter,
  loadOpenAiDashboardProposalConfig,
} from './dashboard/adapter/openai-dashboard-proposal.adapter.js';
import { PrismaDashboardProposalRepositoryAdapter } from './dashboard/adapter/prisma-dashboard-proposal-repository.adapter.js';
import { DashboardProposalContextAdapter } from './dashboard/adapter/dashboard-proposal-context.adapter.js';
import { PrismaEtlProposalRepositoryAdapter } from './etl/adapter/prisma-etl-proposal-repository.adapter.js';
import { PrismaDependencyRepositoryAdapter } from './refresh/adapter/prisma-dependency-repository.adapter.js';
import {
  REQUEST_TENANT_CONTEXT,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../platform/http/request-tenant-context.port.js';
import { AnalysisControllerV1 } from './analyst/api/analysis.controller.js';
import { UnavailableAnalysisCatalogAuthorityAdapterV1 } from './analyst/adapter/analysis-catalog.adapter.js';
import type { AnalysisAdapterPortV1 } from './analyst/application/analysis-adapter.port.js';
import {
  AnalysisCatalogResolverServiceV1,
  asAnalysisCatalogResolverV1,
} from './analyst/application/analysis-catalog-resolver.service.js';
import {
  ANALYSIS_CATALOG_AUTHORITY_PORT,
  type AnalysisCatalogAuthorityPortV1,
} from './analyst/application/analysis-catalog.port.js';
import { AnalysisExecutionServiceV1 } from './analyst/application/analysis-execution.service.js';
import {
  AnalysisProposalServiceV1,
  type AnalysisCatalogV1,
} from './analyst/application/analysis-proposal.service.js';
import {
  DETERMINISTIC_RESULT_PORT,
  type DeterministicResultPortV1,
} from './analyst/application/deterministic-result.port.js';
import {
  ANALYSIS_PLAN_REPOSITORY_PORT,
  type AnalysisPlanRepositoryPortV1,
} from './application/analysis-plan-repository.port.js';
import {
  DASHBOARD_REPOSITORY_PORT,
  type DashboardRepositoryPortV1,
} from './application/dashboard-repository.port.js';
import { DDA_AUDIT_PORT, type DdaAuditPortV1 } from './application/dda-audit.port.js';
import { DdaContentAuthorityV1 } from './application/dda-content-authority.js';
import { DdaPolicyServiceV1 } from './application/dda-policy.service.js';
import {
  DDA_AUD_PORT,
  DDA_BUA_PORT,
  DDA_DSM_PORT,
  DDA_DSO_PORT,
  DDA_IAE_PORT,
  DDA_JRA_PORT,
  type DdaAudComposePortV1,
  type DdaBuaPortV1,
  type DdaDsmPortV1,
  type DdaDsoPortV1,
  type DdaIaePortV1,
  type DdaJraPortV1,
} from './application/foundation-ports.js';
import {
  REFRESH_REPOSITORY_PORT,
  type RefreshRepositoryPortV1,
} from './application/refresh-repository.port.js';
import { InMemoryDashboardDraftRepositoryAdapter } from './dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import { DashboardDraftControllerV1 } from './dashboard/api/dashboard-draft.controller.js';
import { DashboardPublicationControllerV1 } from './dashboard/api/dashboard-publication.controller.js';
import { DashboardQueryControllerV1 } from './dashboard/api/dashboard-query.controller.js';
import { DashboardWidgetResultsControllerV1 } from './dashboard/api/dashboard-widget-results.controller.js';
import { DashboardWorkspaceHistoryControllerV1 } from './dashboard/api/dashboard-workspace-history.controller.js';
import { DashboardProposalControllerV1 } from './dashboard/api/dashboard-proposal.controller.js';
import type { DashboardAuthorizationPortV1 } from './dashboard/application/dashboard-authorization.port.js';
import {
  DASHBOARD_AUTHORIZATION_PORT,
  DASHBOARD_PERMISSION_PROJECTION_PORT,
  DASHBOARD_RESULT_READER_PORT,
  UnavailableDashboardPermissionProjectionPortV1,
  UnavailableDashboardResultReaderV1,
  type DashboardPermissionProjectionPortV1,
  type DashboardResultReaderPortV1,
} from './dashboard/application/dashboard-http-ports.js';
import { DashboardDraftServiceV1 } from './dashboard/application/dashboard-draft.service.js';
import {
  DashboardPublicationServiceV1,
  type DashboardPublicationDependenciesV1,
} from './dashboard/application/dashboard-publication.service.js';
import { DashboardPublicationApprovalInvalidationDispatcherV1 } from './dashboard/application/dashboard-publication-approval-invalidation.dispatcher.js';
import type { DashboardPublicationApprovalInvalidationExecutorPortV1 } from './dashboard/application/dashboard-publication-approval-invalidation.port.js';
import type { DashboardPublicationApprovalInvalidationOutboxPortV1 } from './dashboard/application/dashboard-publication-approval-invalidation-outbox.port.js';
import { DashboardPublicationApprovalInvalidationWorkerV1 } from './dashboard/application/dashboard-publication-approval-invalidation.worker.js';
import { DashboardQueryServiceV1 } from './dashboard/application/dashboard-query.service.js';
import {
  DASHBOARD_WIDGET_RESULT_READER_PORT,
  UnavailableDashboardWidgetResultReaderV1,
  type DashboardWidgetResultReaderPortV1,
} from './dashboard/application/dashboard-widget-result.port.js';
import { VerifiedDashboardWidgetResultReaderAdapterV1 } from './dashboard/adapter/verified-dashboard-widget-result-reader.adapter.js';
import type { DashboardDraftRepositoryPortV1 } from './dashboard/application/dashboard-repository.port.js';
import {
  DASHBOARD_WORKSPACE_HISTORY_PORT,
  type DashboardWorkspaceHistoryPortV1,
} from './dashboard/application/dashboard-workspace-history.port.js';
import { DashboardWorkspaceHistoryServiceV1 } from './dashboard/application/dashboard-workspace-history.service.js';
import {
  DASHBOARD_PROPOSAL_REPOSITORY_PORT,
  type DashboardProposalRepositoryPortV1,
} from './dashboard/application/dashboard-proposal-repository.port.js';
import type { DashboardProposalContextPortV1 } from './dashboard/application/dashboard-proposal-context.port.js';
import type { DashboardProposalPortV1 } from './dashboard/application/dashboard-proposal.port.js';
import {
  DashboardProposalServiceV1,
  type DashboardProposalPolicyStoreV1,
} from './dashboard/application/dashboard-proposal.service.js';
import { InMemoryEtlProposalRepositoryAdapter } from './etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { InMemoryDataImportRepositoryAdapter } from './etl/adapter/in-memory-data-import-repository.adapter.js';
import {
  PrismaDataImportRepositoryAdapter,
  type DataImportDatabaseClientV1,
} from './etl/adapter/prisma-data-import-repository.adapter.js';
import { AutomaticPreparationController } from './etl/api/automatic-preparation.controller.js';
import { DataImportController } from './etl/api/data-import.controller.js';
import { EtlAcceptanceController } from './etl/api/etl-acceptance.controller.js';
import { EtlProposalController } from './etl/api/etl-proposal.controller.js';
import { AutomaticPreparationEnqueueService } from './etl/application/automatic-preparation-enqueue.service.js';
import { AutomaticPreparationService } from './etl/application/automatic-preparation.service.js';
import { EtlAcceptanceServiceV1 } from './etl/application/etl-acceptance.service.js';
import {
  ETL_ACCEPTANCE_AUTHORIZATION_PORT,
  UnavailableEtlAcceptanceAuthorizationAdapter,
  type EtlAcceptanceAuthorizationPortV1,
} from './etl/application/etl-acceptance-authorization.port.js';
import {
  ETL_PROPOSAL_AUTHORITY_PORT,
  UnavailableEtlProposalAuthorityAdapter,
  type EtlProposalAuthorityPortV1,
} from './etl/application/etl-proposal-authority.port.js';
import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from './etl/application/etl-foundation-ports.js';
import type { EtlProposalRepositoryPortV1 } from './etl/application/etl-proposal-repository.port.js';
import { EtlProposalServiceV1 } from './etl/application/etl-proposal.service.js';
import {
  DATA_IMPORT_REPOSITORY_PORT,
  type DataImportRepositoryPortV1,
} from './etl/application/data-import-repository.port.js';
import { DataImportServiceV1 } from './etl/application/data-import.service.js';
import type { EtlProposalResourceResolverPortV1 } from './etl/application/etl-proposal-authority.port.js';
import { WebIntakeController } from './intake/api/web-intake.controller.js';
import type {
  IntakeIaeFinalizationPortV1,
  IntakeIaeUploadPortV1,
} from './intake/application/intake-profile.port.js';
import { WebIntakeServiceV1 } from './intake/application/web-intake.service.js';
import { ReceiptExtractionController } from './receipt/api/receipt-extraction.controller.js';
import {
  loadOpenAiReceiptOcrConfig,
  OpenAiReceiptOcrAdapter,
} from './receipt/adapter/openai-receipt-ocr.adapter.js';
import { DefaultReceiptAiPolicyAdapter } from './receipt/application/default-receipt-ai-policy.adapter.js';
import { DeterministicFakeReceiptOcrAdapter } from './receipt/application/deterministic-fake-receipt-ocr.adapter.js';
import {
  ReceiptAcceptanceService,
  type ReceiptGovernedRecordPort,
} from './receipt/application/receipt-acceptance.service.js';
import type { ReceiptAiPolicyPort } from './receipt/application/receipt-ai-policy.port.js';
import { ReceiptExtractionService } from './receipt/application/receipt-extraction.service.js';
import {
  RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT,
  UnavailableReceiptExtractionCommandRepositoryAdapter,
  type ReceiptExtractionCommandRepositoryPortV1,
} from './receipt/application/receipt-extraction-command.port.js';
import { PrismaReceiptExtractionCommandRepositoryAdapter } from './receipt/adapter/prisma-receipt-extraction-command-repository.adapter.js';
import {
  RECEIPT_MUTATION_AUTHORIZATION_PORT,
  UnavailableReceiptMutationAuthorizationAdapter,
  type ReceiptMutationAuthorizationPortV1,
} from './receipt/application/receipt-mutation-authorization.port.js';
import type { ReceiptOcrPort } from './receipt/application/receipt-ocr.port.js';
import { ReceiptValidationService } from './receipt/application/receipt-validation.service.js';
import { DurableRefreshCoordinatorAdapter } from './refresh/adapter/durable-refresh-coordinator.adapter.js';
import { InMemoryDependencyRepositoryAdapter } from './refresh/adapter/in-memory-dependency-repository.adapter.js';
import { InMemoryRefreshCoordinatorAdapter } from './refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { PrismaRefreshEventStoreAdapter } from './refresh/adapter/prisma-refresh-event-store.adapter.js';
import { DashboardRefreshEventsController } from './refresh/api/dashboard-refresh-events.controller.js';
import { DashboardRefreshController } from './refresh/api/dashboard-refresh.controller.js';
import type { DependencyRepositoryPortV1 } from './refresh/application/dependency-repository.port.js';
import { FreshnessService } from './refresh/application/freshness.service.js';
import { MaterializationProcessorCatalog } from './refresh/application/materialization-processor-catalog.js';
import { RefreshAdmissionService } from './refresh/application/refresh-admission.service.js';
import type { RefreshCoordinatorPortV1 } from './refresh/application/refresh-coordinator.port.js';
import {
  DurableRefreshEventBus,
  RefreshEventBus,
} from './refresh/application/refresh-event-bus.js';
import type { RefreshUsagePortV1 } from './refresh/application/refresh-usage.port.js';
import { RefreshOrchestratorService } from './refresh/application/refresh-orchestrator.service.js';
import { SnapshotCommitService } from './refresh/application/snapshot-commit.service.js';
import { InMemorySourceCatalogRepositoryAdapter } from './source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { PrismaSourceCatalogRepositoryAdapter } from './source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import { TypedAgentToolExecutorAdapter } from './agent/adapter/typed-agent-tool-executor.adapter.js';
import { AgentTurnController } from './agent/api/agent-turn.controller.js';
import { AgentContextBuilderService } from './agent/application/agent-context-builder.service.js';
import {
  AGENT_CONSEQUENTIAL_COMMAND_PORT,
  FailClosedAgentConsequentialCommandAdapter,
  type AgentConsequentialCommandPortV1,
} from './agent/application/agent-consequential-command.port.js';
import type { TypedAgentToolExecutorDependenciesV1 } from './agent/application/typed-agent-tool-executor-dependencies.port.js';
import {
  AGENT_PROVIDER_PORT,
  type AgentProviderPortV1,
  DisabledAgentProviderAdapter,
} from './agent/application/agent-provider.port.js';
import {
  AGENT_AUTHORITY_PORT,
  AGENT_TOOL_EXECUTOR_PORT,
  AGENT_USAGE_PORT,
  FailClosedAgentAuthorityAdapter,
  FailClosedAgentToolExecutorAdapter,
  FailClosedAgentUsageAdapter,
  type AgentAuthorityPortV1,
  type AgentToolExecutorPortV1,
  type AgentUsagePortV1,
  type AgentIamActionAuthorizationPortV1,
} from './agent/application/agent-runtime.port.js';
import { AgentToolRegistryV1 } from './agent/application/agent-tool-registry.js';
import { AgentTurnService } from './agent/application/agent-turn.service.js';
import { InMemoryConversationRepositoryAdapter } from './conversation/adapter/in-memory-conversation-repository.adapter.js';
import { PrismaConversationRepositoryAdapter } from './conversation/adapter/prisma-conversation-repository.adapter.js';
import {
  CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT,
  ConversationController,
  type ConversationContextVersionAuthorityPortV1,
} from './conversation/api/conversation.controller.js';
import {
  CONVERSATION_REPOSITORY_PORT,
  type ConversationRepositoryPortV1,
} from './conversation/application/conversation-repository.port.js';
import { ConversationContextService } from './conversation/application/conversation-context.service.js';
import { ConversationService } from './conversation/application/conversation.service.js';
import { DisabledOpenAiTableExtractionAdapter } from './table-extraction/adapter/openai-table-extraction.adapter.js';
import { TableExtractionController } from './table-extraction/api/table-extraction.controller.js';
import { TableExtractionService } from './table-extraction/application/table-extraction.service.js';
import { FolderProjectionController } from './source-catalog/api/folder-projection.controller.js';
import { SourceCatalogController } from './source-catalog/api/source-catalog.controller.js';
import {
  SOURCE_CATALOG_REPOSITORY_PORT,
  type SourceCatalogRepositoryPortV1,
} from './source-catalog/application/source-catalog-repository.port.js';
import type { SourceCatalogRegistrationPortV1 } from './source-catalog/application/source-catalog-registration.port.js';
import {
  SOURCE_CATALOG_AUTHORIZATION_PORT,
  UnavailableSourceCatalogAuthorizationAdapter,
  type SourceCatalogAuthorizationPortV1,
} from './source-catalog/application/source-catalog-authorization.port.js';
import type { OriginalViewResolverPortV1 } from './source-catalog/application/original-view-resolver.port.js';
import type { IaeOriginalViewPortV1 } from '../iae/application/original-view.service.js';
import {
  ORIGINAL_VIEW_SERVICE,
  OriginalViewService,
} from './source-catalog/application/original-view.service.js';
import {
  SOURCE_CATALOG_SERVICE,
  SourceCatalogService,
} from './source-catalog/application/source-catalog.service.js';
import { DdaNotificationControllerV1 } from './notification/notification.controller.js';
import {
  DDA_NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPortV1,
} from './notification/notification-repository.port.js';
import { PrismaNotificationRepositoryAdapter } from './notification/prisma-notification-repository.adapter.js';
import {
  DDA_NOTIFICATION_PROJECTION_CONSUMER,
  NotificationProjectionConsumerV1,
  UnavailableNotificationResourceAuthorizationAdapter,
  UnavailableNotificationRecipientResolverAdapter,
  type NotificationProjectionCheckpointPortV1,
  type NotificationRecipientResolverPortV1,
  type NotificationResourceAuthorizationPortV1,
} from './notification/notification-projection-consumer.js';
import {
  DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
  DashboardNotificationResourceAuthorizationAdapter,
} from './notification/dashboard-notification-resource-authorization.adapter.js';
import {
  DDA_NOTIFICATION_OUTBOX_CONSUMER,
  NotificationOutboxConsumerV1,
  PrismaNotificationCommittedOutboxAdapter,
  type NotificationCommittedOutboxPortV1,
} from './notification/notification-outbox.consumer.js';
import {
  DDA_NOTIFICATION_OUTBOX_WORKER,
  NotificationOutboxProjectionWorkerV1,
  type NotificationOutboxScopePortV1,
  type NotificationOutboxWorkerOptionsV1,
} from './notification/notification-outbox.worker.js';
import {
  UnavailableNotificationRepositoryAdapter,
  UnavailableNotificationStateCommandAdapter,
} from './notification/unavailable-notification-repository.adapter.js';
import {
  DDA_NOTIFICATION_STATE_COMMAND_PORT,
  type NotificationStateCommandPortV1,
} from './notification/notification-state-command.port.js';
import { IamNotificationRecipientResolverAdapter } from './notification/iam-notification-recipient-resolver.adapter.js';
import type { IamRepositoryPortV1 } from '../iam/application/iam-repository.port.js';
import type { AccessPresetService } from '../iam/application/access-preset.service.js';
import type { DatasetVersionRepositoryPortV1 } from '../dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../dsm/application/governed-dataset-repository.port.js';
import type { ArtifactRepositoryPortV1 } from '../iae/application/artifact-repository.port.js';
import type { ArtifactIntakeRepositoryPortV1 } from '../iae/application/artifact-intake-repository.port.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../dsm/application/governed-dataset-authorization.port.js';
import type { ResultManifestRepositoryPortV1 } from '../jra/application/result-manifest-repository.port.js';
import type { WorkerVerifiedResultManifestPortV1 } from '../jra/worker/worker-result-finalization.port.js';
import {
  DashboardMaterializedResultReaderAdapterV1,
  DashboardPermissionProjectionAdapterV1,
  IamDashboardAuthorizationAdapterV1,
  IamDsmAnalysisCatalogAuthorityAdapterV1,
  PublicPortDeterministicResultAdapterV1,
  type AnalysisCatalogMetadataSourcePortV1,
  type DeterministicAnalysisEnginePortV1,
} from '../../platform/dda-dashboard.composition.js';

export interface DdaEtlPortsV1 {
  readonly iae: EtlIaePortV1;
  readonly dsm: EtlDsmPortV1;
  readonly jra: EtlJraPortV1;
  readonly bua: EtlBuaPortV1;
  readonly aud: EtlAudPortV1;
  readonly policy: EtlPolicyPortV1;
}

export interface DdaModuleOptions {
  readonly runtimeMode?: 'production' | 'test' | 'development';
  /** Explicit opt-in for in-memory adapters outside production (tests/local demos only). */
  readonly allowInMemoryAdapters?: boolean;
  readonly ddaDatabase?: DdaDatabaseClientV1;
  readonly dashboardRepository?: DashboardRepositoryPortV1;
  readonly analysisPlanRepository?: AnalysisPlanRepositoryPortV1;
  readonly refreshRepository?: RefreshRepositoryPortV1;
  readonly etlProposalRepository?: EtlProposalRepositoryPortV1;
  /** Durable server-owned upload/review/approval state. */
  readonly dataImportRepository?: DataImportRepositoryPortV1;
  readonly dashboardDraftRepository?: DashboardDraftRepositoryPortV1;
  readonly dashboardWorkspaceHistory?: DashboardWorkspaceHistoryPortV1;
  readonly dashboardProposalRepository?: DashboardProposalRepositoryPortV1;
  readonly dashboardProposalContext?: DashboardProposalContextPortV1;
  readonly dashboardProposalAdapter?: DashboardProposalPortV1;
  readonly dashboardProposalPolicyStore?: DashboardProposalPolicyStoreV1;
  readonly dashboardPublicationDependencies?: DashboardPublicationDependenciesV1;
  /** Root/JRA executor for committed prior-publication approval invalidation. */
  readonly dashboardPublicationApprovalInvalidationExecutor?: DashboardPublicationApprovalInvalidationExecutorPortV1;
  readonly dependencyRepository?: DependencyRepositoryPortV1;
  readonly refreshCoordinator?: RefreshCoordinatorPortV1;
  readonly intakeIae?: IntakeIaeFinalizationPortV1;
  readonly intakeUpload?: IntakeIaeUploadPortV1;
  readonly receiptOcr?: ReceiptOcrPort;
  readonly receiptAiPolicy?: ReceiptAiPolicyPort;
  readonly iaePort?: DdaIaePortV1;
  readonly dsmPort?: DdaDsmPortV1;
  readonly jraPort?: DdaJraPortV1;
  readonly dsoPort?: DdaDsoPortV1;
  readonly buaPort?: DdaBuaPortV1;
  readonly audPort?: DdaAudComposePortV1;
  readonly auditPort?: DdaAuditPortV1;
  readonly etlPorts?: DdaEtlPortsV1;
  readonly etlAcceptanceAuthorization?: EtlAcceptanceAuthorizationPortV1;
  /** IAM + IAE/DSM proposal authority; omitted composition fails closed. */
  readonly etlProposalAuthority?: EtlProposalAuthorityPortV1;
  /** IAE/DSM-owned exact ETL resource resolver; omitted composition remains unavailable. */
  readonly etlProposalResourceResolver?: EtlProposalResourceResolverPortV1;
  readonly dashboardAuthorization?: DashboardAuthorizationPortV1;
  /** Server-owned materialized rows; omitted composition remains unavailable. */
  readonly dashboardResultReader?: DashboardResultReaderPortV1;
  /** Canonical JRA/IAE-backed v4 widget values; omitted composition stays unavailable. */
  readonly dashboardWidgetResultReader?: DashboardWidgetResultReaderPortV1;
  readonly workerVerifiedResultManifests?: WorkerVerifiedResultManifestPortV1;
  /** Current actor permission projection; omitted composition remains unavailable. */
  readonly dashboardPermissionProjection?: DashboardPermissionProjectionPortV1;
  /** Server-owned IAM/DSM/permission authority resolved fresh for each proposal. */
  readonly analysisCatalogAuthority?: AnalysisCatalogAuthorityPortV1;
  /** Root IAM/DSM composition inputs; omitted dependencies remain unavailable. */
  readonly accessPresetService?: AccessPresetService;
  readonly governedDatasetAuthorization?: GovernedDatasetAuthorizationPortV1;
  readonly datasetVersionRepository?: DatasetVersionRepositoryPortV1;
  readonly governedDatasetRepository?: GovernedDatasetRepositoryPortV1;
  readonly artifactRepository?: ArtifactRepositoryPortV1;
  readonly artifactIntakeRepository?: ArtifactIntakeRepositoryPortV1;
  readonly resultManifestRepository?: ResultManifestRepositoryPortV1;
  readonly analysisCatalogSource?: AnalysisCatalogMetadataSourcePortV1;
  readonly analysisEngine?: DeterministicAnalysisEnginePortV1;
  /** Compatibility hook for focused tests. Production must use analysisCatalogAuthority. */
  readonly analysisCatalog?: AnalysisCatalogV1;
  readonly analysisAdapter?: AnalysisAdapterPortV1;
  readonly deterministicResults?: DeterministicResultPortV1;
  readonly receiptRecords?: ReceiptGovernedRecordPort;
  readonly refreshUsage?: RefreshUsagePortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly sourceCatalogRepository?: SourceCatalogRepositoryPortV1;
  /** Server-owned registration used by approved imports to populate DDA-052. */
  readonly sourceCatalogRegistration?: SourceCatalogRegistrationPortV1;
  readonly sourceCatalogAuthorization?: SourceCatalogAuthorizationPortV1;
  readonly originalViewResolver?: OriginalViewResolverPortV1;
  /** IAE public original-view authority; omitted composition remains fail closed for cloud views. */
  readonly iaeOriginalViewPort?: IaeOriginalViewPortV1;
  readonly conversationRepository?: ConversationRepositoryPortV1;
  readonly conversationContextVersionAuthority?: ConversationContextVersionAuthorityPortV1;
  readonly receiptCommandRepository?: ReceiptExtractionCommandRepositoryPortV1;
  readonly receiptMutationAuthorization?: ReceiptMutationAuthorizationPortV1;
  /** Durable committed-event notification projection; omitted composition fails closed. */
  readonly notificationRepository?: NotificationRepositoryPortV1;
  /** IAM application port used to resolve active notification recipients. */
  readonly iamRepository?: IamRepositoryPortV1;
  /** Durable committed-event source; defaults to the DDA committed event outbox. */
  readonly notificationOutbox?: NotificationCommittedOutboxPortV1;
  /** IAM/resource-owned recipient authorization; omitted composition remains unavailable. */
  readonly notificationRecipientResolver?: NotificationRecipientResolverPortV1;
  /** Resource authorization evaluated after active IAM membership resolution. */
  readonly notificationResourceAuthorization?: NotificationResourceAuthorizationPortV1;
  /** Durable projection checkpoint; defaults to the Prisma notification adapter when available. */
  readonly notificationProjectionCheckpoints?: NotificationProjectionCheckpointPortV1;
  /** Production-only bounded scheduler; omitted options use safe defaults. */
  readonly notificationOutboxWorker?: NotificationOutboxWorkerOptionsV1;
  /** IAM-owned agent authority; omitted composition fails closed. */
  readonly agentAuthority?: AgentAuthorityPortV1;
  /** BUA-owned usage admission; omitted composition fails closed. */
  readonly agentUsage?: AgentUsagePortV1;
  /** Canonical BUA admission service; omitted resolver/admission remains fail closed. */
  readonly agentUsageAdmissionService?: AgentUsageAdmissionPortV1;
  /** Server-owned mapping from agent cost class to BUA entitlement policy. */
  readonly agentUsageAdmissionResolver?: AgentUsageAdmissionResolverPortV1;
  /** Typed DDA application-service executor; omitted composition fails closed. */
  readonly agentToolExecutor?: AgentToolExecutorPortV1;
  /** Optional typed DDA/DSM/IAE public application-port overrides; unavailable tools stay closed. */
  readonly agentToolDependencies?: Partial<
    Omit<
      TypedAgentToolExecutorDependenciesV1,
      'registry' | 'authority' | 'iamActionAuthorization' | 'consequentialCommand'
    >
  >;
  /** Fresh IAM action authorization for every typed tool. */
  readonly agentIamActionAuthorization?: AgentIamActionAuthorizationPortV1;
  /** Durable mutation reserve/audit/commit/replay boundary. */
  readonly agentConsequentialCommand?: AgentConsequentialCommandPortV1;
  /** Owner-enabled provider transport; omitted composition remains disabled. */
  readonly agentProvider?: AgentProviderPortV1;
}

@Module({})
export class DdaModule {
  public static register(options: DdaModuleOptions = {}): DynamicModule {
    const runtimeMode =
      options.runtimeMode ??
      (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');
    if (
      runtimeMode === 'production' &&
      options.ddaDatabase === undefined &&
      options.allowInMemoryAdapters !== true
    ) {
      throw new Error('DDA_PRODUCTION_DATABASE_REQUIRED');
    }
    if (
      runtimeMode === 'production' &&
      options.ddaDatabase !== undefined &&
      options.refreshCoordinator !== undefined
    ) {
      throw new Error('DDA_PRODUCTION_REFRESH_OUTBOX_REQUIRED');
    }

    const failClosed = createFailClosedDdaFoundationPortsV1();
    const iae = options.iaePort ?? failClosed.iae;
    const dsm = options.dsmPort ?? failClosed.dsm;
    const aud = options.audPort ?? failClosed.aud;
    const jra = options.jraPort ?? failClosed.jra;
    const dso = options.dsoPort ?? failClosed.dso;
    const bua = options.buaPort ?? failClosed.bua;
    const etlPorts = options.etlPorts ?? createFailClosedEtlPortsV1();
    const etlProposals =
      options.etlProposalRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryEtlProposalRepositoryAdapter()
        : new PrismaEtlProposalRepositoryAdapter(options.ddaDatabase));
    const drafts =
      options.dashboardDraftRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryDashboardDraftRepositoryAdapter()
        : new PrismaDashboardDraftRepositoryAdapter(options.ddaDatabase));
    const refreshRepository =
      options.refreshRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryRefreshRepositoryAdapter()
        : new PrismaRefreshRepositoryAdapter(options.ddaDatabase));
    const dashboardRepository =
      options.dashboardRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryDashboardRepositoryAdapter()
        : new PrismaDashboardRepositoryAdapter(options.ddaDatabase));
    const analysisPlanRepository =
      options.analysisPlanRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryAnalysisPlanRepositoryAdapter()
        : new PrismaAnalysisPlanRepositoryAdapter(options.ddaDatabase));
    const analysisCatalogAuthority =
      options.analysisCatalogAuthority ??
      (options.iamRepository !== undefined &&
      options.datasetVersionRepository !== undefined &&
      options.governedDatasetAuthorization !== undefined &&
      options.analysisCatalogSource !== undefined
        ? new IamDsmAnalysisCatalogAuthorityAdapterV1({
            iam: options.iamRepository,
            datasets: options.datasetVersionRepository,
            datasetAuthorization: options.governedDatasetAuthorization,
            dsm,
            source: options.analysisCatalogSource,
          })
        : undefined);
    const authorization =
      options.dashboardAuthorization ??
      (options.iamRepository !== undefined &&
      options.accessPresetService !== undefined &&
      options.datasetVersionRepository !== undefined &&
      options.governedDatasetAuthorization !== undefined
        ? new IamDashboardAuthorizationAdapterV1({
            iam: options.iamRepository,
            accessPresets: options.accessPresetService,
            datasets: options.datasetVersionRepository,
            datasetAuthorization: options.governedDatasetAuthorization,
            refresh: refreshRepository,
            dashboards: dashboardRepository,
            drafts,
            analysisPlans: analysisPlanRepository,
            ...(analysisCatalogAuthority === undefined
              ? {}
              : { catalogs: analysisCatalogAuthority }),
          })
        : createFailClosedDashboardAuthorizationV1());
    const canonicalDashboardAuthorizationConfigured =
      options.dashboardAuthorization !== undefined ||
      (options.iamRepository !== undefined &&
        options.accessPresetService !== undefined &&
        options.datasetVersionRepository !== undefined &&
        options.governedDatasetAuthorization !== undefined);
    const dashboardPermissionProjection =
      options.dashboardPermissionProjection ??
      (analysisCatalogAuthority !== undefined
        ? new DashboardPermissionProjectionAdapterV1({
            refresh: refreshRepository,
            analysisPlans: analysisPlanRepository,
            catalogs: analysisCatalogAuthority,
            authorization,
          })
        : new UnavailableDashboardPermissionProjectionPortV1());
    const dashboardResultReader =
      options.dashboardResultReader ??
      (options.resultManifestRepository !== undefined
        ? new DashboardMaterializedResultReaderAdapterV1({
            refresh: refreshRepository,
            dashboards: dashboardRepository,
            manifests: options.resultManifestRepository,
            iae,
            authorization,
            projection: dashboardPermissionProjection,
          })
        : new UnavailableDashboardResultReaderV1());
    const dashboardWidgetResultReader =
      options.dashboardWidgetResultReader ??
      (options.workerVerifiedResultManifests === undefined
        ? new UnavailableDashboardWidgetResultReaderV1()
        : new VerifiedDashboardWidgetResultReaderAdapterV1({
            snapshots: refreshRepository,
            dashboards: dashboardRepository,
            manifests: options.workerVerifiedResultManifests,
            iae,
          }));
    const dashboardWorkspaceHistory =
      options.dashboardWorkspaceHistory ??
      (options.ddaDatabase === undefined
        ? new InMemoryDashboardWorkspaceHistoryAdapter()
        : new PrismaDashboardWorkspaceHistoryAdapter(
            options.ddaDatabase,
            authorization,
            analysisCatalogAuthority,
            analysisPlanRepository,
          ));
    const dashboardProposalRepository =
      options.dashboardProposalRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryDashboardProposalRepositoryAdapter()
        : new PrismaDashboardProposalRepositoryAdapter(options.ddaDatabase));
    const dashboardProposalAdapter =
      options.dashboardProposalAdapter ??
      new OpenAiDashboardProposalAdapter(loadOpenAiDashboardProposalConfig());
    const refreshEventStore =
      options.ddaDatabase === undefined
        ? undefined
        : new PrismaRefreshEventStoreAdapter(options.ddaDatabase);
    const refreshCoordinator =
      options.refreshCoordinator ??
      (options.ddaDatabase === undefined
        ? new InMemoryRefreshCoordinatorAdapter()
        : new DurableRefreshCoordinatorAdapter(refreshRepository, refreshEventStore));
    const dependencyRepository =
      options.dependencyRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryDependencyRepositoryAdapter()
        : new PrismaDependencyRepositoryAdapter(options.ddaDatabase));
    const catalog = new MaterializationProcessorCatalog();
    catalog.register({
      processorId: 'dda.materialize.query.v1',
      compatibleChangeKinds: ['APPEND_ROWS'],
      requiresPriorStateProof: true,
    });
    const receiptOcr =
      options.receiptOcr ??
      (() => {
        const openAiConfig = loadOpenAiReceiptOcrConfig();
        // Production never substitutes synthetic OCR for an unavailable provider.
        if (runtimeMode === 'production') {
          return new OpenAiReceiptOcrAdapter(openAiConfig);
        }
        // Local demos may use the deterministic fixture when OpenAI was not configured.
        if (
          openAiConfig.apiKeyPresent ||
          process.env['DATABREEZE_OPENAI_RECEIPT_ENABLED'] === 'true'
        ) {
          return new OpenAiReceiptOcrAdapter(openAiConfig);
        }
        return new DeterministicFakeReceiptOcrAdapter();
      })();
    const intakeIae = options.intakeIae ?? createFailClosedIntakeIaeV1();
    const webIntakeService = new WebIntakeServiceV1(intakeIae, options.intakeUpload);
    const sourceCatalogRepository =
      options.sourceCatalogRepository ??
      (options.ddaDatabase === undefined
        ? new InMemorySourceCatalogRepositoryAdapter()
        : new PrismaSourceCatalogRepositoryAdapter(
            options.ddaDatabase as unknown as ConstructorParameters<
              typeof PrismaSourceCatalogRepositoryAdapter
            >[0],
          ));
    const sourceCatalogRegistration =
      options.sourceCatalogRegistration ??
      (sourceCatalogRepository instanceof InMemorySourceCatalogRepositoryAdapter ||
      sourceCatalogRepository instanceof PrismaSourceCatalogRepositoryAdapter
        ? sourceCatalogRepository
        : undefined);
    const dataImportRepository =
      options.dataImportRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryDataImportRepositoryAdapter()
        : new PrismaDataImportRepositoryAdapter(
            options.ddaDatabase as unknown as DataImportDatabaseClientV1,
          ));
    const dataImportService = new DataImportServiceV1({
      imports: dataImportRepository,
      webIntake: webIntakeService,
      ...(options.governedDatasetRepository === undefined
        ? {}
        : { governedDatasets: options.governedDatasetRepository }),
      ...(options.datasetVersionRepository === undefined
        ? {}
        : { datasetVersions: options.datasetVersionRepository }),
      ...(options.artifactRepository === undefined
        ? {}
        : { artifacts: options.artifactRepository }),
      ...(options.artifactIntakeRepository === undefined
        ? {}
        : { artifactIntake: options.artifactIntakeRepository }),
      ...(sourceCatalogRegistration === undefined ? {} : { sourceCatalogRegistration }),
    });
    const etlProposalService = new EtlProposalServiceV1(etlProposals);
    const etlAcceptanceAuthorization =
      options.etlAcceptanceAuthorization ?? new UnavailableEtlAcceptanceAuthorizationAdapter();
    const etlProposalAuthority =
      options.etlProposalAuthority ?? new UnavailableEtlProposalAuthorityAdapter();
    const etlAcceptanceService = new EtlAcceptanceServiceV1(etlProposals, etlPorts, {
      authorization: etlAcceptanceAuthorization,
      proposalAuthority: etlProposalAuthority,
    });
    const automaticPreparationService = new AutomaticPreparationService();
    const automaticPreparationEnqueueService = new AutomaticPreparationEnqueueService(
      automaticPreparationService,
      etlProposals,
      etlAcceptanceService,
    );
    const analysisCatalogResolver = asAnalysisCatalogResolverV1(
      options.analysisCatalog ??
        new AnalysisCatalogResolverServiceV1(
          analysisCatalogAuthority ?? new UnavailableAnalysisCatalogAuthorityAdapterV1(),
        ),
    );
    const deterministicResults =
      options.deterministicResults ??
      (options.analysisEngine !== undefined && analysisCatalogAuthority !== undefined
        ? new PublicPortDeterministicResultAdapterV1({
            catalogs: analysisCatalogAuthority,
            dsm,
            jra,
            engine: options.analysisEngine,
            analysisPlanRepository,
          })
        : createFailClosedDeterministicResultsV1());
    const dashboardProposalContext =
      options.dashboardProposalContext ??
      new DashboardProposalContextAdapter({
        dashboardDraftRepository: drafts,
        dashboardRepository,
        analysisPlanRepository,
        dashboardAuthorization: authorization,
        dependencyRepository,
        analysisCatalog: async (context, plan) => {
          const resolved = await analysisCatalogResolver.resolve(context, {
            datasetVersionId: plan.datasetVersionId,
            semanticVersionId: plan.semanticVersionId,
            metricVersionId: plan.metricVersionId,
            permissionProjectionVersionId: plan.permissionProjectionVersionId,
          });
          if (!resolved.accepted) return undefined;
          return Object.freeze({
            ...resolved.value,
            authorizedMetrics: Object.freeze(Object.keys(plan.units)),
            resultShapes: Object.freeze([plan.output.form]),
            estimatedCostLimits: plan.estimate,
          });
        },
        deterministicResults,
      });
    const analysisProposalService = new AnalysisProposalServiceV1(
      options.analysisAdapter ?? createFailClosedAnalysisAdapterV1(),
      analysisCatalogResolver,
    );
    const analysisExecutionService = new AnalysisExecutionServiceV1(deterministicResults);
    const dashboardDraftService = new DashboardDraftServiceV1(drafts, authorization, {
      proposalRepository: dashboardProposalRepository,
      aud,
    });
    const requestTenantContext =
      options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter();
    const dashboardPublicationService = new DashboardPublicationServiceV1(
      drafts,
      authorization,
      options.dashboardPublicationDependencies,
    );
    const publicationInvalidationOutbox = asPublicationInvalidationOutbox(drafts);
    const publicationInvalidationExecutor =
      options.dashboardPublicationApprovalInvalidationExecutor ??
      asPublicationInvalidationExecutor(options.dashboardPublicationDependencies?.approvals);
    const publicationInvalidationDispatcher =
      publicationInvalidationOutbox === undefined || publicationInvalidationExecutor === undefined
        ? undefined
        : new DashboardPublicationApprovalInvalidationDispatcherV1(
            publicationInvalidationOutbox,
            publicationInvalidationExecutor,
          );
    const publicationInvalidationWorker =
      publicationInvalidationDispatcher === undefined || publicationInvalidationOutbox === undefined
        ? undefined
        : new DashboardPublicationApprovalInvalidationWorkerV1(
            publicationInvalidationOutbox,
            publicationInvalidationDispatcher,
            {
              workerId:
                process.env['DDA_PUBLICATION_INVALIDATION_WORKER_ID'] ??
                'dda-publication-invalidation-worker',
            },
          );
    const dashboardQueryService = new DashboardQueryServiceV1(authorization);
    const dashboardWorkspaceHistoryService = new DashboardWorkspaceHistoryServiceV1(
      dashboardWorkspaceHistory,
    );
    const dashboardProposalService = new DashboardProposalServiceV1(
      dashboardProposalAdapter,
      dashboardProposalContext,
      dashboardProposalRepository,
      {
        bua,
        aud,
        authorization,
        ...(options.dashboardProposalPolicyStore === undefined
          ? {}
          : { policyStore: options.dashboardProposalPolicyStore }),
      },
    );
    const freshnessService = new FreshnessService(refreshCoordinator);
    const refreshEventBus =
      refreshEventStore === undefined
        ? new RefreshEventBus()
        : new DurableRefreshEventBus(refreshEventStore);
    const snapshotCommit = new SnapshotCommitService(
      refreshCoordinator,
      options.workerVerifiedResultManifests,
      runtimeMode === 'production',
    );
    const refreshUsage = options.refreshUsage ?? createFailClosedRefreshUsageV1();
    const refreshAdmission = new RefreshAdmissionService(refreshCoordinator, refreshUsage);
    const refreshOrchestrator = new RefreshOrchestratorService(refreshCoordinator, snapshotCommit);
    void dependencyRepository;
    void catalog;
    const receiptValidation = new ReceiptValidationService();
    const receiptAiPolicy = options.receiptAiPolicy ?? new DefaultReceiptAiPolicyAdapter();
    const receiptCommandRepository: ReceiptExtractionCommandRepositoryPortV1 =
      options.receiptCommandRepository ??
      (options.ddaDatabase === undefined
        ? new UnavailableReceiptExtractionCommandRepositoryAdapter()
        : new PrismaReceiptExtractionCommandRepositoryAdapter(options.ddaDatabase));
    const receiptMutationAuthorization =
      options.receiptMutationAuthorization ?? new UnavailableReceiptMutationAuthorizationAdapter();
    const receiptExtraction = new ReceiptExtractionService(
      receiptOcr,
      iae,
      aud,
      receiptAiPolicy,
      bua,
      {
        commands: receiptCommandRepository,
        authorization: receiptMutationAuthorization,
      },
    );
    const receiptAcceptance = new ReceiptAcceptanceService(
      receiptValidation,
      dsm,
      iae,
      aud,
      options.receiptRecords ?? createFailClosedReceiptRecordsV1(),
    );
    const notificationRepository =
      options.notificationRepository ??
      (options.ddaDatabase === undefined
        ? new UnavailableNotificationRepositoryAdapter()
        : new PrismaNotificationRepositoryAdapter(options.ddaDatabase));
    const notificationProjectionCheckpoints =
      options.notificationProjectionCheckpoints ??
      (notificationRepository instanceof PrismaNotificationRepositoryAdapter
        ? notificationRepository
        : undefined);
    const notificationResourceAuthorization: NotificationResourceAuthorizationPortV1 =
      options.notificationResourceAuthorization ??
      (canonicalDashboardAuthorizationConfigured
        ? new DashboardNotificationResourceAuthorizationAdapter(authorization)
        : new UnavailableNotificationResourceAuthorizationAdapter());
    const notificationProjectionConsumer =
      notificationProjectionCheckpoints === undefined
        ? undefined
        : new NotificationProjectionConsumerV1(
            notificationRepository,
            options.notificationRecipientResolver ??
              (options.iamRepository === undefined
                ? new UnavailableNotificationRecipientResolverAdapter()
                : new IamNotificationRecipientResolverAdapter(
                    options.iamRepository,
                    notificationResourceAuthorization,
                  )),
            notificationProjectionCheckpoints,
          );
    const notificationStateCommand: NotificationStateCommandPortV1 =
      options.notificationRepository !== undefined &&
      typeof (options.notificationRepository as Partial<NotificationStateCommandPortV1>)
        .setStateCommand === 'function'
        ? (options.notificationRepository as unknown as NotificationStateCommandPortV1)
        : notificationRepository instanceof PrismaNotificationRepositoryAdapter
          ? notificationRepository
          : new UnavailableNotificationStateCommandAdapter();
    const notificationOutbox =
      options.notificationOutbox ??
      (options.ddaDatabase === undefined
        ? undefined
        : new PrismaNotificationCommittedOutboxAdapter(options.ddaDatabase));
    const notificationOutboxScopes: NotificationOutboxScopePortV1 | undefined =
      notificationOutbox !== undefined &&
      typeof (notificationOutbox as Partial<NotificationOutboxScopePortV1>).listPendingScopes ===
        'function'
        ? (notificationOutbox as unknown as NotificationOutboxScopePortV1)
        : undefined;
    const notificationOutboxConsumer =
      notificationOutbox === undefined ||
      notificationProjectionConsumer === undefined ||
      notificationProjectionCheckpoints === undefined
        ? undefined
        : new NotificationOutboxConsumerV1(
            notificationOutbox,
            notificationProjectionConsumer,
            notificationProjectionCheckpoints,
          );
    const notificationOutboxWorker =
      runtimeMode !== 'production' ||
      notificationOutboxScopes === undefined ||
      notificationOutboxConsumer === undefined
        ? undefined
        : new NotificationOutboxProjectionWorkerV1(
            notificationOutboxScopes,
            notificationOutboxConsumer,
            options.notificationOutboxWorker ?? {},
          );
    const sourceCatalogAuthorization =
      options.sourceCatalogAuthorization ?? new UnavailableSourceCatalogAuthorizationAdapter();
    const sourceCatalogService = new SourceCatalogService(
      sourceCatalogRepository,
      sourceCatalogAuthorization,
    );
    const originalViewService = new OriginalViewService(
      sourceCatalogService,
      sourceCatalogRepository,
      options.originalViewResolver,
      options.iaeOriginalViewPort,
    );
    const tableExtractionService = new TableExtractionService(
      new DisabledOpenAiTableExtractionAdapter(),
    );
    const conversationRepository: ConversationRepositoryPortV1 =
      options.conversationRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryConversationRepositoryAdapter()
        : new PrismaConversationRepositoryAdapter(options.ddaDatabase));
    const conversationService = new ConversationService(conversationRepository);
    const conversationContextService = new ConversationContextService(conversationRepository);
    const agentToolRegistry = new AgentToolRegistryV1();
    const agentContextBuilder = new AgentContextBuilderService();
    const consequentialCommand: AgentConsequentialCommandPortV1 =
      options.agentConsequentialCommand ??
      (options.ddaDatabase === undefined
        ? new FailClosedAgentConsequentialCommandAdapter()
        : new PrismaAgentConsequentialCommandAdapter(options.ddaDatabase));
    // Local development may honor the same owner-enabled provider gate; the factory
    // itself fails closed to Disabled when the server-held key is absent or invalid.
    const agentProvider: AgentProviderPortV1 =
      options.agentProvider ??
      (runtimeMode === 'production' || process.env['DATABREEZE_OPENAI_AGENT_ENABLED'] === 'true'
        ? createProductionAgentProvider()
        : new DisabledAgentProviderAdapter());
    const agentAuthority = options.agentAuthority ?? new FailClosedAgentAuthorityAdapter();
    const agentUsage =
      options.agentUsage ??
      (options.agentUsageAdmissionService !== undefined &&
      options.agentUsageAdmissionResolver !== undefined
        ? new BuaAgentUsageAdapter(
            options.agentUsageAdmissionService,
            options.agentUsageAdmissionResolver,
          )
        : new FailClosedAgentUsageAdapter());
    const agentToolDependencies = options.agentToolDependencies ?? {};
    const agentToolExecutor =
      options.agentToolExecutor ??
      (options.agentIamActionAuthorization === undefined
        ? new FailClosedAgentToolExecutorAdapter()
        : new TypedAgentToolExecutorAdapter({
            ...agentToolDependencies,
            registry: agentToolRegistry,
            authority: agentAuthority,
            iamActionAuthorization: options.agentIamActionAuthorization,
            consequentialCommand,
            analysisProposalService:
              agentToolDependencies.analysisProposalService ?? analysisProposalService,
            deterministicResults:
              agentToolDependencies.deterministicResults ?? deterministicResults,
            dashboardProposalService:
              agentToolDependencies.dashboardProposalService ?? dashboardProposalService,
            dashboardDraftService:
              agentToolDependencies.dashboardDraftService ?? dashboardDraftService,
            audit: agentToolDependencies.audit ?? aud,
          }));
    const agentTurnService = new AgentTurnService({
      conversations: conversationService,
      conversationRepository,
      registry: agentToolRegistry,
      contextBuilder: agentContextBuilder,
      provider: agentProvider,
      authority: agentAuthority,
      usage: agentUsage,
      executor: agentToolExecutor,
    });

    return {
      module: DdaModule,
      controllers: [
        WebIntakeController,
        DataImportController,
        EtlProposalController,
        EtlAcceptanceController,
        AutomaticPreparationController,
        AnalysisControllerV1,
        DashboardDraftControllerV1,
        DashboardPublicationControllerV1,
        DashboardQueryControllerV1,
        DashboardWidgetResultsControllerV1,
        DashboardWorkspaceHistoryControllerV1,
        DashboardProposalControllerV1,
        DashboardRefreshController,
        DashboardRefreshEventsController,
        ReceiptExtractionController,
        SourceCatalogController,
        FolderProjectionController,
        TableExtractionController,
        ConversationController,
        AgentTurnController,
        DdaNotificationControllerV1,
      ],
      providers: [
        {
          provide: DASHBOARD_REPOSITORY_PORT,
          useValue: dashboardRepository,
        },
        {
          provide: ANALYSIS_PLAN_REPOSITORY_PORT,
          useValue: analysisPlanRepository,
        },
        {
          provide: REFRESH_REPOSITORY_PORT,
          useValue: refreshRepository,
        },
        { provide: DDA_IAE_PORT, useValue: iae },
        { provide: DDA_DSM_PORT, useValue: dsm },
        { provide: DDA_JRA_PORT, useValue: jra },
        { provide: DDA_DSO_PORT, useValue: dso },
        { provide: DDA_BUA_PORT, useValue: bua },
        { provide: DDA_AUD_PORT, useValue: aud },
        {
          provide: DDA_AUDIT_PORT,
          useValue: options.auditPort ?? createFailClosedDdaAuditPortV1(),
        },
        { provide: DdaContentAuthorityV1, useFactory: () => new DdaContentAuthorityV1() },
        {
          provide: DdaPolicyServiceV1,
          useFactory: (auditPort: DdaAuditPortV1, iaePort: DdaIaePortV1) =>
            new DdaPolicyServiceV1(auditPort, iaePort),
          inject: [DDA_AUDIT_PORT, DDA_IAE_PORT],
        },
        { provide: WebIntakeServiceV1, useValue: webIntakeService },
        { provide: DATA_IMPORT_REPOSITORY_PORT, useValue: dataImportRepository },
        { provide: DataImportServiceV1, useValue: dataImportService },
        { provide: EtlProposalServiceV1, useValue: etlProposalService },
        { provide: EtlAcceptanceServiceV1, useValue: etlAcceptanceService },
        { provide: ETL_ACCEPTANCE_AUTHORIZATION_PORT, useValue: etlAcceptanceAuthorization },
        { provide: ETL_PROPOSAL_AUTHORITY_PORT, useValue: etlProposalAuthority },
        { provide: AutomaticPreparationService, useValue: automaticPreparationService },
        {
          provide: AutomaticPreparationEnqueueService,
          useValue: automaticPreparationEnqueueService,
        },
        { provide: AnalysisProposalServiceV1, useValue: analysisProposalService },
        { provide: AnalysisExecutionServiceV1, useValue: analysisExecutionService },
        {
          provide: ANALYSIS_CATALOG_AUTHORITY_PORT,
          useValue: analysisCatalogAuthority ?? new UnavailableAnalysisCatalogAuthorityAdapterV1(),
        },
        { provide: DETERMINISTIC_RESULT_PORT, useValue: deterministicResults },
        { provide: DashboardDraftServiceV1, useValue: dashboardDraftService },
        { provide: DashboardPublicationServiceV1, useValue: dashboardPublicationService },
        ...(publicationInvalidationWorker === undefined
          ? []
          : [
              {
                provide: DashboardPublicationApprovalInvalidationWorkerV1,
                useValue: publicationInvalidationWorker,
              },
            ]),
        { provide: DashboardQueryServiceV1, useValue: dashboardQueryService },
        { provide: DASHBOARD_AUTHORIZATION_PORT, useValue: authorization },
        { provide: DASHBOARD_RESULT_READER_PORT, useValue: dashboardResultReader },
        { provide: DASHBOARD_WIDGET_RESULT_READER_PORT, useValue: dashboardWidgetResultReader },
        {
          provide: DASHBOARD_PERMISSION_PROJECTION_PORT,
          useValue: dashboardPermissionProjection,
        },
        {
          provide: DASHBOARD_WORKSPACE_HISTORY_PORT,
          useValue: dashboardWorkspaceHistory,
        },
        {
          provide: DashboardWorkspaceHistoryServiceV1,
          useValue: dashboardWorkspaceHistoryService,
        },
        {
          provide: DASHBOARD_PROPOSAL_REPOSITORY_PORT,
          useValue: dashboardProposalRepository,
        },
        {
          provide: DashboardProposalServiceV1,
          useValue: dashboardProposalService,
        },
        { provide: FreshnessService, useValue: freshnessService },
        { provide: SnapshotCommitService, useValue: snapshotCommit },
        { provide: RefreshAdmissionService, useValue: refreshAdmission },
        { provide: RefreshOrchestratorService, useValue: refreshOrchestrator },
        { provide: RefreshEventBus, useValue: refreshEventBus },
        { provide: ReceiptExtractionService, useValue: receiptExtraction },
        { provide: ReceiptAcceptanceService, useValue: receiptAcceptance },
        {
          provide: RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT,
          useValue: receiptCommandRepository,
        },
        { provide: RECEIPT_MUTATION_AUTHORIZATION_PORT, useValue: receiptMutationAuthorization },
        { provide: SOURCE_CATALOG_REPOSITORY_PORT, useValue: sourceCatalogRepository },
        { provide: SOURCE_CATALOG_AUTHORIZATION_PORT, useValue: sourceCatalogAuthorization },
        { provide: SOURCE_CATALOG_SERVICE, useValue: sourceCatalogService },
        { provide: ORIGINAL_VIEW_SERVICE, useValue: originalViewService },
        { provide: TableExtractionService, useValue: tableExtractionService },
        { provide: CONVERSATION_REPOSITORY_PORT, useValue: conversationRepository },
        ...(options.conversationContextVersionAuthority === undefined
          ? []
          : [
              {
                provide: CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT,
                useValue: options.conversationContextVersionAuthority,
              },
            ]),
        { provide: ConversationService, useValue: conversationService },
        { provide: ConversationContextService, useValue: conversationContextService },
        { provide: AgentToolRegistryV1, useValue: agentToolRegistry },
        { provide: AgentContextBuilderService, useValue: agentContextBuilder },
        { provide: AGENT_PROVIDER_PORT, useValue: agentProvider },
        { provide: AGENT_AUTHORITY_PORT, useValue: agentAuthority },
        { provide: AGENT_USAGE_PORT, useValue: agentUsage },
        { provide: AGENT_CONSEQUENTIAL_COMMAND_PORT, useValue: consequentialCommand },
        { provide: AGENT_TOOL_EXECUTOR_PORT, useValue: agentToolExecutor },
        { provide: AgentTurnService, useValue: agentTurnService },
        { provide: REQUEST_TENANT_CONTEXT, useValue: requestTenantContext },
        { provide: DDA_NOTIFICATION_REPOSITORY_PORT, useValue: notificationRepository },
        { provide: DDA_NOTIFICATION_STATE_COMMAND_PORT, useValue: notificationStateCommand },
        {
          provide: DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
          useValue: notificationResourceAuthorization,
        },
        ...(notificationProjectionConsumer === undefined
          ? []
          : [
              {
                provide: NotificationProjectionConsumerV1,
                useValue: notificationProjectionConsumer,
              },
              {
                provide: DDA_NOTIFICATION_PROJECTION_CONSUMER,
                useValue: notificationProjectionConsumer,
              },
            ]),
        ...(notificationOutboxConsumer === undefined
          ? []
          : [{ provide: DDA_NOTIFICATION_OUTBOX_CONSUMER, useValue: notificationOutboxConsumer }]),
        ...(notificationOutboxWorker === undefined
          ? []
          : [
              {
                provide: DDA_NOTIFICATION_OUTBOX_WORKER,
                useValue: notificationOutboxWorker,
              },
            ]),
      ],
      exports: [
        DASHBOARD_REPOSITORY_PORT,
        ANALYSIS_PLAN_REPOSITORY_PORT,
        REFRESH_REPOSITORY_PORT,
        DDA_IAE_PORT,
        DDA_DSM_PORT,
        DDA_JRA_PORT,
        DDA_DSO_PORT,
        DDA_BUA_PORT,
        DDA_AUD_PORT,
        DDA_AUDIT_PORT,
        DdaContentAuthorityV1,
        DdaPolicyServiceV1,
        WebIntakeServiceV1,
        EtlProposalServiceV1,
        EtlAcceptanceServiceV1,
        ETL_ACCEPTANCE_AUTHORIZATION_PORT,
        ETL_PROPOSAL_AUTHORITY_PORT,
        AutomaticPreparationService,
        AutomaticPreparationEnqueueService,
        AnalysisProposalServiceV1,
        AnalysisExecutionServiceV1,
        ANALYSIS_CATALOG_AUTHORITY_PORT,
        DETERMINISTIC_RESULT_PORT,
        DashboardDraftServiceV1,
        DashboardPublicationServiceV1,
        DashboardQueryServiceV1,
        RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT,
        RECEIPT_MUTATION_AUTHORIZATION_PORT,
        DASHBOARD_AUTHORIZATION_PORT,
        DASHBOARD_RESULT_READER_PORT,
        DASHBOARD_WIDGET_RESULT_READER_PORT,
        DASHBOARD_PERMISSION_PROJECTION_PORT,
        DASHBOARD_WORKSPACE_HISTORY_PORT,
        DashboardWorkspaceHistoryServiceV1,
        DASHBOARD_PROPOSAL_REPOSITORY_PORT,
        DashboardProposalServiceV1,
        FreshnessService,
        SnapshotCommitService,
        RefreshAdmissionService,
        RefreshOrchestratorService,
        RefreshEventBus,
        ReceiptExtractionService,
        ReceiptAcceptanceService,
        SOURCE_CATALOG_REPOSITORY_PORT,
        SOURCE_CATALOG_AUTHORIZATION_PORT,
        SOURCE_CATALOG_SERVICE,
        ORIGINAL_VIEW_SERVICE,
        TableExtractionService,
        CONVERSATION_REPOSITORY_PORT,
        ConversationService,
        ConversationContextService,
        AgentToolRegistryV1,
        AgentContextBuilderService,
        AGENT_PROVIDER_PORT,
        AGENT_AUTHORITY_PORT,
        AGENT_USAGE_PORT,
        AGENT_CONSEQUENTIAL_COMMAND_PORT,
        AGENT_TOOL_EXECUTOR_PORT,
        AgentTurnService,
        DDA_NOTIFICATION_REPOSITORY_PORT,
        DDA_NOTIFICATION_STATE_COMMAND_PORT,
        DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
        ...(notificationProjectionConsumer === undefined
          ? []
          : [DDA_NOTIFICATION_PROJECTION_CONSUMER]),
        ...(notificationOutboxConsumer === undefined ? [] : [DDA_NOTIFICATION_OUTBOX_CONSUMER]),
        ...(notificationOutboxWorker === undefined ? [] : [DDA_NOTIFICATION_OUTBOX_WORKER]),
        ...(notificationProjectionConsumer === undefined ? [] : [NotificationProjectionConsumerV1]),
      ],
    };
  }
}

function asPublicationInvalidationOutbox(
  value: unknown,
): DashboardPublicationApprovalInvalidationOutboxPortV1 | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { readonly listPendingTenantScopes?: unknown }).listPendingTenantScopes !==
      'function' ||
    typeof (value as { readonly claimNext?: unknown }).claimNext !== 'function'
  ) {
    return undefined;
  }
  return value as DashboardPublicationApprovalInvalidationOutboxPortV1;
}

function asPublicationInvalidationExecutor(
  value: unknown,
): DashboardPublicationApprovalInvalidationExecutorPortV1 | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { readonly invalidatePublicationApproval?: unknown })
      .invalidatePublicationApproval !== 'function'
  ) {
    return undefined;
  }
  return value as DashboardPublicationApprovalInvalidationExecutorPortV1;
}
