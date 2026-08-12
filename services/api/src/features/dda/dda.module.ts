import { type DynamicModule, Module } from '@nestjs/common';

import type { DdaDatabaseClientV1 } from './adapter/dda-database.client.js';
import {
  createFailClosedAnalysisAdapterV1,
  createFailClosedAnalysisCatalogV1,
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
import { PrismaEtlProposalRepositoryAdapter } from './etl/adapter/prisma-etl-proposal-repository.adapter.js';
import { PrismaDependencyRepositoryAdapter } from './refresh/adapter/prisma-dependency-repository.adapter.js';
import {
  REQUEST_TENANT_CONTEXT,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../platform/http/request-tenant-context.port.js';
import { AnalysisControllerV1 } from './analyst/api/analysis.controller.js';
import type { AnalysisAdapterPortV1 } from './analyst/application/analysis-adapter.port.js';
import { AnalysisExecutionServiceV1 } from './analyst/application/analysis-execution.service.js';
import {
  AnalysisProposalServiceV1,
  type AnalysisCatalogV1,
} from './analyst/application/analysis-proposal.service.js';
import type { DeterministicResultPortV1 } from './analyst/application/deterministic-result.port.js';
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
import type { DashboardAuthorizationPortV1 } from './dashboard/application/dashboard-authorization.port.js';
import { DashboardDraftServiceV1 } from './dashboard/application/dashboard-draft.service.js';
import { DashboardPublicationServiceV1 } from './dashboard/application/dashboard-publication.service.js';
import { DashboardQueryServiceV1 } from './dashboard/application/dashboard-query.service.js';
import type { DashboardDraftRepositoryPortV1 } from './dashboard/application/dashboard-repository.port.js';
import { InMemoryEtlProposalRepositoryAdapter } from './etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { AutomaticPreparationController } from './etl/api/automatic-preparation.controller.js';
import { EtlAcceptanceController } from './etl/api/etl-acceptance.controller.js';
import { EtlProposalController } from './etl/api/etl-proposal.controller.js';
import { AutomaticPreparationEnqueueService } from './etl/application/automatic-preparation-enqueue.service.js';
import { AutomaticPreparationService } from './etl/application/automatic-preparation.service.js';
import { EtlAcceptanceServiceV1 } from './etl/application/etl-acceptance.service.js';
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
import { WebIntakeController } from './intake/api/web-intake.controller.js';
import type { IntakeIaeFinalizationPortV1 } from './intake/application/intake-profile.port.js';
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
import type { ReceiptOcrPort } from './receipt/application/receipt-ocr.port.js';
import { ReceiptValidationService } from './receipt/application/receipt-validation.service.js';
import { DurableRefreshCoordinatorAdapter } from './refresh/adapter/durable-refresh-coordinator.adapter.js';
import { InMemoryDependencyRepositoryAdapter } from './refresh/adapter/in-memory-dependency-repository.adapter.js';
import { InMemoryRefreshCoordinatorAdapter } from './refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { DashboardRefreshEventsController } from './refresh/api/dashboard-refresh-events.controller.js';
import { DashboardRefreshController } from './refresh/api/dashboard-refresh.controller.js';
import type { DependencyRepositoryPortV1 } from './refresh/application/dependency-repository.port.js';
import { FreshnessService } from './refresh/application/freshness.service.js';
import { MaterializationProcessorCatalog } from './refresh/application/materialization-processor-catalog.js';
import type { RefreshCoordinatorPortV1 } from './refresh/application/refresh-coordinator.port.js';
import { RefreshEventBus } from './refresh/application/refresh-event-bus.js';
import type { RefreshUsagePortV1 } from './refresh/application/refresh-usage.port.js';
import { SnapshotCommitService } from './refresh/application/snapshot-commit.service.js';
import { InMemorySourceCatalogRepositoryAdapter } from './source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { PrismaSourceCatalogRepositoryAdapter } from './source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import { InMemoryConversationRepositoryAdapter } from './conversation/adapter/in-memory-conversation-repository.adapter.js';
import { ConversationController } from './conversation/api/conversation.controller.js';
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
import {
  ORIGINAL_VIEW_SERVICE,
  OriginalViewService,
} from './source-catalog/application/original-view.service.js';
import {
  SOURCE_CATALOG_SERVICE,
  SourceCatalogService,
} from './source-catalog/application/source-catalog.service.js';

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
  readonly dashboardDraftRepository?: DashboardDraftRepositoryPortV1;
  readonly dependencyRepository?: DependencyRepositoryPortV1;
  readonly refreshCoordinator?: RefreshCoordinatorPortV1;
  readonly intakeIae?: IntakeIaeFinalizationPortV1;
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
  readonly dashboardAuthorization?: DashboardAuthorizationPortV1;
  readonly analysisCatalog?: AnalysisCatalogV1;
  readonly analysisAdapter?: AnalysisAdapterPortV1;
  readonly deterministicResults?: DeterministicResultPortV1;
  readonly receiptRecords?: ReceiptGovernedRecordPort;
  readonly refreshUsage?: RefreshUsagePortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly sourceCatalogRepository?: SourceCatalogRepositoryPortV1;
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
    const authorization =
      options.dashboardAuthorization ?? createFailClosedDashboardAuthorizationV1();
    const refreshRepository =
      options.refreshRepository ??
      (options.ddaDatabase === undefined
        ? new InMemoryRefreshRepositoryAdapter()
        : new PrismaRefreshRepositoryAdapter(options.ddaDatabase));
    const refreshCoordinator =
      options.refreshCoordinator ??
      (options.ddaDatabase === undefined
        ? new InMemoryRefreshCoordinatorAdapter()
        : new DurableRefreshCoordinatorAdapter(refreshRepository));
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
        // Production path uses the fail-closed OpenAI adapter whenever credentials or the
        // kill switch are configured. Demo/dev without keys keeps the deterministic fake.
        if (
          openAiConfig.apiKeyPresent ||
          process.env['DATABREEZE_OPENAI_RECEIPT_ENABLED'] === 'true'
        ) {
          return new OpenAiReceiptOcrAdapter(openAiConfig);
        }
        return new DeterministicFakeReceiptOcrAdapter();
      })();
    const intakeIae = options.intakeIae ?? createFailClosedIntakeIaeV1();
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

    const webIntakeService = new WebIntakeServiceV1(intakeIae);
    const etlProposalService = new EtlProposalServiceV1(etlProposals);
    const etlAcceptanceService = new EtlAcceptanceServiceV1(etlProposals, etlPorts);
    const automaticPreparationService = new AutomaticPreparationService();
    const automaticPreparationEnqueueService = new AutomaticPreparationEnqueueService(
      automaticPreparationService,
      etlProposals,
      etlAcceptanceService,
    );
    const analysisProposalService = new AnalysisProposalServiceV1(
      options.analysisAdapter ?? createFailClosedAnalysisAdapterV1(),
      options.analysisCatalog ?? createFailClosedAnalysisCatalogV1(),
    );
    const analysisExecutionService = new AnalysisExecutionServiceV1(
      options.deterministicResults ?? createFailClosedDeterministicResultsV1(),
    );
    const dashboardDraftService = new DashboardDraftServiceV1(drafts, authorization);
    const requestTenantContext =
      options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter();
    const dashboardPublicationService = new DashboardPublicationServiceV1(drafts, authorization);
    const dashboardQueryService = new DashboardQueryServiceV1(authorization);
    const freshnessService = new FreshnessService(refreshCoordinator);
    const refreshEventBus = new RefreshEventBus();
    const snapshotCommit = new SnapshotCommitService(refreshCoordinator);
    void dependencyRepository;
    void catalog;
    void (options.refreshUsage ?? createFailClosedRefreshUsageV1());
    void snapshotCommit;
    const receiptValidation = new ReceiptValidationService();
    const receiptAiPolicy = options.receiptAiPolicy ?? new DefaultReceiptAiPolicyAdapter();
    const receiptExtraction = new ReceiptExtractionService(
      receiptOcr,
      iae,
      aud,
      receiptAiPolicy,
      bua,
    );
    const receiptAcceptance = new ReceiptAcceptanceService(
      receiptValidation,
      dsm,
      iae,
      aud,
      options.receiptRecords ?? createFailClosedReceiptRecordsV1(),
    );
    void receiptAcceptance;
    const sourceCatalogRepository =
      options.sourceCatalogRepository ??
      (options.ddaDatabase === undefined
        ? new InMemorySourceCatalogRepositoryAdapter()
        : new PrismaSourceCatalogRepositoryAdapter(
            options.ddaDatabase as unknown as ConstructorParameters<
              typeof PrismaSourceCatalogRepositoryAdapter
            >[0],
          ));
    const sourceCatalogService = new SourceCatalogService(sourceCatalogRepository);
    const originalViewService = new OriginalViewService(
      sourceCatalogService,
      sourceCatalogRepository,
    );
    const tableExtractionService = new TableExtractionService(
      new DisabledOpenAiTableExtractionAdapter(),
    );
    const conversationRepository: ConversationRepositoryPortV1 =
      new InMemoryConversationRepositoryAdapter();
    const conversationService = new ConversationService(conversationRepository);
    const conversationContextService = new ConversationContextService(conversationRepository);

    return {
      module: DdaModule,
      controllers: [
        WebIntakeController,
        EtlProposalController,
        EtlAcceptanceController,
        AutomaticPreparationController,
        AnalysisControllerV1,
        DashboardDraftControllerV1,
        DashboardPublicationControllerV1,
        DashboardQueryControllerV1,
        DashboardRefreshController,
        DashboardRefreshEventsController,
        ReceiptExtractionController,
        SourceCatalogController,
        FolderProjectionController,
        TableExtractionController,
        ConversationController,
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
        { provide: EtlProposalServiceV1, useValue: etlProposalService },
        { provide: EtlAcceptanceServiceV1, useValue: etlAcceptanceService },
        { provide: AutomaticPreparationService, useValue: automaticPreparationService },
        {
          provide: AutomaticPreparationEnqueueService,
          useValue: automaticPreparationEnqueueService,
        },
        { provide: AnalysisProposalServiceV1, useValue: analysisProposalService },
        { provide: AnalysisExecutionServiceV1, useValue: analysisExecutionService },
        { provide: DashboardDraftServiceV1, useValue: dashboardDraftService },
        { provide: DashboardPublicationServiceV1, useValue: dashboardPublicationService },
        { provide: DashboardQueryServiceV1, useValue: dashboardQueryService },
        { provide: FreshnessService, useValue: freshnessService },
        { provide: RefreshEventBus, useValue: refreshEventBus },
        { provide: ReceiptExtractionService, useValue: receiptExtraction },
        { provide: SOURCE_CATALOG_REPOSITORY_PORT, useValue: sourceCatalogRepository },
        { provide: SOURCE_CATALOG_SERVICE, useValue: sourceCatalogService },
        { provide: ORIGINAL_VIEW_SERVICE, useValue: originalViewService },
        { provide: TableExtractionService, useValue: tableExtractionService },
        { provide: CONVERSATION_REPOSITORY_PORT, useValue: conversationRepository },
        { provide: ConversationService, useValue: conversationService },
        { provide: ConversationContextService, useValue: conversationContextService },
        { provide: REQUEST_TENANT_CONTEXT, useValue: requestTenantContext },
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
        AutomaticPreparationService,
        AutomaticPreparationEnqueueService,
        AnalysisProposalServiceV1,
        AnalysisExecutionServiceV1,
        DashboardDraftServiceV1,
        DashboardPublicationServiceV1,
        DashboardQueryServiceV1,
        FreshnessService,
        RefreshEventBus,
        ReceiptExtractionService,
        SOURCE_CATALOG_REPOSITORY_PORT,
        SOURCE_CATALOG_SERVICE,
        ORIGINAL_VIEW_SERVICE,
        TableExtractionService,
        CONVERSATION_REPOSITORY_PORT,
        ConversationService,
        ConversationContextService,
      ],
    };
  }
}
