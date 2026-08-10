import { type DynamicModule, Module } from '@nestjs/common';

import { InMemoryAnalysisPlanRepositoryAdapter } from './adapter/in-memory-analysis-plan-repository.adapter.js';
import { InMemoryDashboardRepositoryAdapter } from './adapter/in-memory-dashboard-repository.adapter.js';
import { InMemoryRefreshRepositoryAdapter } from './adapter/in-memory-refresh-repository.adapter.js';
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
import { EtlAcceptanceController } from './etl/api/etl-acceptance.controller.js';
import { EtlProposalController } from './etl/api/etl-proposal.controller.js';
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
import { DeterministicFakeReceiptOcrAdapter } from './receipt/application/deterministic-fake-receipt-ocr.adapter.js';
import {
  ReceiptAcceptanceService,
  type ReceiptGovernedRecordPort,
} from './receipt/application/receipt-acceptance.service.js';
import { ReceiptExtractionService } from './receipt/application/receipt-extraction.service.js';
import type { ReceiptOcrPort } from './receipt/application/receipt-ocr.port.js';
import { ReceiptValidationService } from './receipt/application/receipt-validation.service.js';
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

export interface DdaModuleOptions {
  readonly dashboardRepository?: DashboardRepositoryPortV1;
  readonly analysisPlanRepository?: AnalysisPlanRepositoryPortV1;
  readonly refreshRepository?: RefreshRepositoryPortV1;
  readonly etlProposalRepository?: EtlProposalRepositoryPortV1;
  readonly dashboardDraftRepository?: DashboardDraftRepositoryPortV1;
  readonly dependencyRepository?: DependencyRepositoryPortV1;
  readonly refreshCoordinator?: RefreshCoordinatorPortV1;
  readonly intakeIae?: IntakeIaeFinalizationPortV1;
  readonly receiptOcr?: ReceiptOcrPort;
  readonly iaePort?: DdaIaePortV1;
  readonly dsmPort?: DdaDsmPortV1;
  readonly jraPort?: DdaJraPortV1;
  readonly dsoPort?: DdaDsoPortV1;
  readonly buaPort?: DdaBuaPortV1;
  readonly audPort?: DdaAudComposePortV1;
  readonly auditPort?: DdaAuditPortV1;
}

const PROTO_ARTIFACT = '00000000-0000-4000-8000-000000000302';
const PROTO_DATASET = '00000000-0000-4000-8000-000000000303';
const PROTO_JOB = '00000000-0000-4000-8000-000000000304';
const PROTO_POLICY = '00000000-0000-4000-8000-0000000000aa';

function prototypeIae(): DdaIaePortV1 {
  return {
    async requireArtifactVersion() {
      return undefined;
    },
    async requireEvidenceReference() {
      return undefined;
    },
    async addRetentionConstraint() {
      return undefined;
    },
  };
}

function prototypeDsm(): DdaDsmPortV1 {
  return {
    async requireDatasetVersion() {
      return undefined;
    },
    async requireSemanticVersion() {
      return undefined;
    },
    async requireMetricVersion() {
      return undefined;
    },
  };
}

function prototypeAud(): DdaAudComposePortV1 {
  return {
    async emitContentSafeSummary() {
      return undefined;
    },
  };
}

function prototypeIntakeIae(): IntakeIaeFinalizationPortV1 {
  return {
    async finalizeSession(input) {
      return Object.freeze({
        accepted: true as const,
        value: Object.freeze({
          sessionId: input.sessionId,
          artifactVersionId: PROTO_ARTIFACT,
          status: 'FINALIZED' as const,
        }),
      });
    },
  };
}

function prototypeEtlPorts(): {
  readonly iae: EtlIaePortV1;
  readonly dsm: EtlDsmPortV1;
  readonly jra: EtlJraPortV1;
  readonly bua: EtlBuaPortV1;
  readonly aud: EtlAudPortV1;
  readonly policy: EtlPolicyPortV1;
} {
  return {
    iae: {
      async registerDerivative() {
        return Object.freeze({ accepted: true as const, artifactVersionId: PROTO_ARTIFACT });
      },
    },
    dsm: {
      async registerDatasetVersion() {
        return Object.freeze({
          accepted: true as const,
          datasetVersionId: PROTO_DATASET,
          revision: 1,
        });
      },
    },
    jra: {
      async createTypedJob() {
        return Object.freeze({ accepted: true as const, jobId: PROTO_JOB, replayed: false });
      },
      async awaitResultManifest() {
        return Object.freeze({
          accepted: true as const,
          manifest: Object.freeze({
            rowCount: 4,
            contentHash: 'a'.repeat(64),
            schemaHash: 'b'.repeat(64),
            rejectBundleId: '00000000-0000-4000-8000-000000000305',
            lineageIds: Object.freeze(['00000000-0000-4000-8000-000000000012']),
            partial: false,
          }),
        });
      },
    },
    bua: {
      async admit() {
        return Object.freeze({ accepted: true as const });
      },
    },
    aud: {
      async emit() {
        return Object.freeze({ accepted: true as const });
      },
    },
    policy: {
      async currentPolicyVersionId() {
        return PROTO_POLICY;
      },
    },
  };
}

function prototypeAnalysisCatalog(): AnalysisCatalogV1 {
  return Object.freeze({
    datasetVersionId: PROTO_DATASET,
    semanticVersionId: '00000000-0000-4000-8000-000000000311',
    metricVersionId: '00000000-0000-4000-8000-000000000312',
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000313',
    authorizedFields: Object.freeze(['region', 'amount', 'sold_at']),
    authorizedJoins: Object.freeze([]),
    units: Object.freeze({ amount: 'VND' }),
    grains: Object.freeze(['day']),
  });
}

function prototypeAnalysisAdapter(): AnalysisAdapterPortV1 {
  return {
    async isAvailable() {
      return false;
    },
    async proposeTypedPlan() {
      return Object.freeze({ status: 'FAILED' as const, rationale: 'ADAPTER_DISABLED_FOR_PROTOTYPE' });
    },
  };
}

function prototypeDeterministicResults(): DeterministicResultPortV1 {
  return {
    async execute(input) {
      return Object.freeze({
        resultId: '00000000-0000-4000-8000-000000000321',
        cells: Object.freeze([
          Object.freeze({
            cellId: '00000000-0000-4000-8000-000000000322',
            field: 'amount',
            value: 1_200_000,
            unit: 'VND',
            planVersionId: input.plan.planId,
            metricVersionId: '00000000-0000-4000-8000-000000000312',
          }),
        ]),
        provenance: Object.freeze({
          planVersionId: input.plan.planId,
          datasetVersionId: PROTO_DATASET,
          engineVersion: '0.1.0-prototype',
        }),
      });
    },
  };
}

function prototypeDashboardAuthorization(): DashboardAuthorizationPortV1 {
  return {
    async authorizeDashboardAction() {
      return Object.freeze({
        allowed: true,
        grantsDatasetAccess: true,
        grantsEvidenceAccess: true,
      });
    },
    async projectVisibleFields() {
      return Object.freeze(['region', 'amount', 'sold_at']);
    },
  };
}

function prototypeRefreshUsage(): RefreshUsagePortV1 {
  return {
    async evaluate() {
      return Object.freeze({ admitted: true });
    },
    async reserve(input) {
      return Object.freeze({ reservationId: `res-${input.reservationKey}` });
    },
    async finalize() {
      return undefined;
    },
    async release() {
      return undefined;
    },
    async emitContentSafeOutcome() {
      return undefined;
    },
  };
}

function prototypeReceiptRecords(): ReceiptGovernedRecordPort {
  return {
    async appendGovernedRecord(input) {
      return Object.freeze({
        datasetVersionId: input.datasetVersionId || PROTO_DATASET,
      });
    },
  };
}

@Module({})
export class DdaModule {
  public static register(options: DdaModuleOptions = {}): DynamicModule {
    const iae = options.iaePort ?? prototypeIae();
    const dsm = options.dsmPort ?? prototypeDsm();
    const aud = options.audPort ?? prototypeAud();
    const etlPorts = prototypeEtlPorts();
    const etlProposals =
      options.etlProposalRepository ?? new InMemoryEtlProposalRepositoryAdapter();
    const drafts =
      options.dashboardDraftRepository ?? new InMemoryDashboardDraftRepositoryAdapter();
    const authorization = prototypeDashboardAuthorization();
    const refreshCoordinator =
      options.refreshCoordinator ?? new InMemoryRefreshCoordinatorAdapter();
    const dependencyRepository =
      options.dependencyRepository ?? new InMemoryDependencyRepositoryAdapter();
    const catalog = new MaterializationProcessorCatalog();
    catalog.register({
      processorId: 'dda.materialize.query.v1',
      compatibleChangeKinds: ['APPEND_ROWS'],
      requiresPriorStateProof: true,
    });
    const receiptOcr = options.receiptOcr ?? new DeterministicFakeReceiptOcrAdapter();
    const intakeIae = options.intakeIae ?? prototypeIntakeIae();

    const webIntakeService = new WebIntakeServiceV1(intakeIae);
    const etlProposalService = new EtlProposalServiceV1(etlProposals);
    const etlAcceptanceService = new EtlAcceptanceServiceV1(etlProposals, etlPorts);
    const analysisProposalService = new AnalysisProposalServiceV1(
      prototypeAnalysisAdapter(),
      prototypeAnalysisCatalog(),
    );
    const analysisExecutionService = new AnalysisExecutionServiceV1(
      prototypeDeterministicResults(),
    );
    const dashboardDraftService = new DashboardDraftServiceV1(drafts);
    const dashboardPublicationService = new DashboardPublicationServiceV1(drafts, authorization);
    const dashboardQueryService = new DashboardQueryServiceV1(authorization);
    const freshnessService = new FreshnessService(refreshCoordinator);
    const refreshEventBus = new RefreshEventBus();
    const snapshotCommit = new SnapshotCommitService(refreshCoordinator);
    void dependencyRepository;
    void catalog;
    void prototypeRefreshUsage();
    void snapshotCommit;
    const receiptValidation = new ReceiptValidationService();
    const receiptExtraction = new ReceiptExtractionService(receiptOcr, iae, aud);
    const receiptAcceptance = new ReceiptAcceptanceService(
      receiptValidation,
      dsm,
      iae,
      aud,
      prototypeReceiptRecords(),
    );
    void receiptAcceptance;

    return {
      module: DdaModule,
      controllers: [
        WebIntakeController,
        EtlProposalController,
        EtlAcceptanceController,
        AnalysisControllerV1,
        DashboardDraftControllerV1,
        DashboardPublicationControllerV1,
        DashboardQueryControllerV1,
        DashboardRefreshController,
        DashboardRefreshEventsController,
        ReceiptExtractionController,
      ],
      providers: [
        {
          provide: DASHBOARD_REPOSITORY_PORT,
          useValue: options.dashboardRepository ?? new InMemoryDashboardRepositoryAdapter(),
        },
        {
          provide: ANALYSIS_PLAN_REPOSITORY_PORT,
          useValue: options.analysisPlanRepository ?? new InMemoryAnalysisPlanRepositoryAdapter(),
        },
        {
          provide: REFRESH_REPOSITORY_PORT,
          useValue: options.refreshRepository ?? new InMemoryRefreshRepositoryAdapter(),
        },
        { provide: DDA_IAE_PORT, useValue: iae },
        { provide: DDA_DSM_PORT, useValue: dsm },
        {
          provide: DDA_JRA_PORT,
          useValue:
            options.jraPort ??
            ({
              async requireJob() {
                return undefined;
              },
              async requireResultManifest() {
                return undefined;
              },
            } satisfies DdaJraPortV1),
        },
        {
          provide: DDA_DSO_PORT,
          useValue:
            options.dsoPort ??
            ({
              async requireCapabilityGrant() {
                return undefined;
              },
              async requireProjection() {
                return undefined;
              },
            } satisfies DdaDsoPortV1),
        },
        {
          provide: DDA_BUA_PORT,
          useValue:
            options.buaPort ??
            ({
              async requireAdmission() {
                return undefined;
              },
            } satisfies DdaBuaPortV1),
        },
        { provide: DDA_AUD_PORT, useValue: aud },
        {
          provide: DDA_AUDIT_PORT,
          useValue:
            options.auditPort ??
            ({
              async emitContentSafeSummary() {
                return undefined;
              },
            } satisfies DdaAuditPortV1),
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
        { provide: AnalysisProposalServiceV1, useValue: analysisProposalService },
        { provide: AnalysisExecutionServiceV1, useValue: analysisExecutionService },
        { provide: DashboardDraftServiceV1, useValue: dashboardDraftService },
        { provide: DashboardPublicationServiceV1, useValue: dashboardPublicationService },
        { provide: DashboardQueryServiceV1, useValue: dashboardQueryService },
        { provide: FreshnessService, useValue: freshnessService },
        { provide: RefreshEventBus, useValue: refreshEventBus },
        { provide: ReceiptExtractionService, useValue: receiptExtraction },
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
        AnalysisProposalServiceV1,
        AnalysisExecutionServiceV1,
        DashboardDraftServiceV1,
        DashboardPublicationServiceV1,
        DashboardQueryServiceV1,
        FreshnessService,
        RefreshEventBus,
        ReceiptExtractionService,
      ],
    };
  }
}
