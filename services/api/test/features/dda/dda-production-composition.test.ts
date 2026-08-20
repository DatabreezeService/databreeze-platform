/* eslint-disable @typescript-eslint/require-await -- composition fakes mirror async authority ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_PROVIDER_PORT,
  DisabledAgentProviderAdapter,
} from '../../../src/features/dda/agent/application/agent-provider.port.js';
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
} from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import {
  DASHBOARD_AUTHORIZATION_PORT,
  DASHBOARD_PERMISSION_PROJECTION_PORT,
  DASHBOARD_RESULT_READER_PORT,
  type DashboardPermissionProjectionPortV1,
  type DashboardResultReaderPortV1,
} from '../../../src/features/dda/dashboard/application/dashboard-http-ports.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import {
  DashboardMaterializedResultReaderAdapterV1,
  DashboardPermissionProjectionAdapterV1,
  IamDashboardAuthorizationAdapterV1,
  IamDsmAnalysisCatalogAuthorityAdapterV1,
  PublicPortDeterministicResultAdapterV1,
} from '../../../src/platform/dda-dashboard.composition.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import type { IamRepositoryPortV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../../../src/features/dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../../src/features/dsm/application/governed-dataset-authorization.port.js';
import { ANALYSIS_CATALOG_AUTHORITY_PORT } from '../../../src/features/dda/analyst/application/analysis-catalog.port.js';
import type { AnalysisPlanRepositoryPortV1 } from '../../../src/features/dda/application/analysis-plan-repository.port.js';
import type { ResultManifestRepositoryPortV1 } from '../../../src/features/jra/application/result-manifest-repository.port.js';
import type {
  AnalysisCatalogMetadataSourcePortV1,
  DeterministicAnalysisEnginePortV1,
} from '../../../src/platform/dda-dashboard.composition.js';
import { DETERMINISTIC_RESULT_PORT } from '../../../src/features/dda/analyst/application/deterministic-result.port.js';
import type { DeterministicResultResponseV1 } from '../../../src/features/dda/analyst/application/deterministic-result.port.js';
import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';
import { DdaModule } from '../../../src/features/dda/dda.module.js';
import { AppModule } from '../../../src/app.module.js';
import type { JraApprovalAuthorityPortV1 } from '../../../src/features/jra/application/approval-authority.port.js';
import { PrismaNotificationRepositoryAdapter } from '../../../src/features/dda/notification/prisma-notification-repository.adapter.js';
import { DDA_NOTIFICATION_REPOSITORY_PORT } from '../../../src/features/dda/notification/notification-repository.port.js';
import { NotificationProjectionConsumerV1 } from '../../../src/features/dda/notification/notification-projection-consumer.js';
import { DDA_NOTIFICATION_STATE_COMMAND_PORT } from '../../../src/features/dda/notification/notification-state-command.port.js';
import {
  DDA_NOTIFICATION_OUTBOX_CONSUMER,
  NotificationOutboxConsumerV1,
} from '../../../src/features/dda/notification/notification-outbox.consumer.js';
import {
  DDA_NOTIFICATION_OUTBOX_WORKER,
  NotificationOutboxProjectionWorkerV1,
} from '../../../src/features/dda/notification/notification-outbox.worker.js';
import {
  DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
  DashboardNotificationResourceAuthorizationAdapter,
} from '../../../src/features/dda/notification/dashboard-notification-resource-authorization.adapter.js';
import { UnavailableNotificationRepositoryAdapter } from '../../../src/features/dda/notification/unavailable-notification-repository.adapter.js';
import { InMemoryRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { DashboardPublicationApprovalInvalidationWorkerV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation.worker.js';
import {
  DurableRefreshEventBus,
  RefreshEventBus,
} from '../../../src/features/dda/refresh/application/refresh-event-bus.js';
import { RefreshAdmissionService } from '../../../src/features/dda/refresh/application/refresh-admission.service.js';
import { RefreshOrchestratorService } from '../../../src/features/dda/refresh/application/refresh-orchestrator.service.js';
import { SnapshotCommitService } from '../../../src/features/dda/refresh/application/snapshot-commit.service.js';
import { ReceiptAcceptanceService } from '../../../src/features/dda/receipt/application/receipt-acceptance.service.js';
import { AnalysisProposalServiceV1 } from '../../../src/features/dda/analyst/application/analysis-proposal.service.js';
import { OpenAiAnalysisAdapter } from '../../../src/features/dda/analyst/adapter/openai-analysis.adapter.js';

function providerValue(module: ReturnType<typeof DdaModule.register>, token: unknown): unknown {
  const providers = (module.providers ?? []) as readonly {
    readonly provide?: unknown;
    readonly useValue?: unknown;
  }[];
  return providers.find((provider) => provider.provide === token)?.useValue;
}

function importedDda(
  module: ReturnType<typeof AppModule.register>,
): ReturnType<typeof DdaModule.register> {
  const candidate = (module.imports ?? []).find(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'module' in value &&
      value.module === DdaModule,
  );
  assert.ok(candidate);
  return candidate as ReturnType<typeof DdaModule.register>;
}

void test('[DDA-036] production composition fails closed without durable database binding', () => {
  assert.throws(
    () =>
      DdaModule.register({
        runtimeMode: 'production',
      }),
    (error: unknown) =>
      error instanceof Error && error.message === 'DDA_PRODUCTION_DATABASE_REQUIRED',
  );
});

void test('[DDA-034][DDA-036] production database composition selects the durable refresh backplane', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });
  const bus = providerValue(module, RefreshEventBus);
  assert.ok(bus instanceof DurableRefreshEventBus);
});

void test('[DDA-030][DDA-032][DDA-036] production exposes the durable refresh lifecycle services', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });

  assert.ok(providerValue(module, SnapshotCommitService) instanceof SnapshotCommitService);
  assert.ok(
    providerValue(module, RefreshOrchestratorService) instanceof RefreshOrchestratorService,
  );
  assert.ok(providerValue(module, RefreshAdmissionService) instanceof RefreshAdmissionService);
});

void test('[DDA-042][DDA-045] production exposes one receipt acceptance application service', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });

  assert.ok(providerValue(module, ReceiptAcceptanceService) instanceof ReceiptAcceptanceService);
});

void test('[DDA-025][DDA-029][AUD-003] production DDA composition constructs the bounded approval invalidation worker', () => {
  const executor = {
    invalidatePublicationApproval: async () => ({ accepted: true as const }),
  };
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    dashboardPublicationApprovalInvalidationExecutor: executor,
  });
  assert.ok(
    providerValue(module, DashboardPublicationApprovalInvalidationWorkerV1) instanceof
      DashboardPublicationApprovalInvalidationWorkerV1,
  );
});

void test('[NCO-014] notification worker starts by default only in production', () => {
  const configuredProduction = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });
  assert.ok(
    providerValue(configuredProduction, DDA_NOTIFICATION_OUTBOX_WORKER) instanceof
      NotificationOutboxProjectionWorkerV1,
  );

  const configuredTest = DdaModule.register({
    runtimeMode: 'test',
    ddaDatabase: {} as DdaDatabaseClientV1,
    notificationOutboxWorker: {},
  });
  assert.equal(providerValue(configuredTest, DDA_NOTIFICATION_OUTBOX_WORKER), undefined);
});

void test('[DDA-025][DDA-029][AUD-003] root production composition passes one JRA invalidation executor into DDA', () => {
  const authority = {
    findCurrentApproved: async () => ({ accepted: false as const, code: 'NOT_FOUND' as const }),
    invalidateMaterialChange: async () => ({ accepted: true as const }),
    invalidatePriorVersion: async () => ({ accepted: true as const }),
  } satisfies JraApprovalAuthorityPortV1;
  const app = AppModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    approvalAuthority: authority,
  });
  const dda = importedDda(app);
  assert.ok(
    providerValue(dda, DashboardPublicationApprovalInvalidationWorkerV1) instanceof
      DashboardPublicationApprovalInvalidationWorkerV1,
  );
});

void test('[NCO-001][NCO-012] database composition selects durable notification persistence and projection consumer', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });
  assert.ok(
    providerValue(module, DDA_NOTIFICATION_REPOSITORY_PORT) instanceof
      PrismaNotificationRepositoryAdapter,
  );
  assert.ok(
    providerValue(module, DDA_NOTIFICATION_STATE_COMMAND_PORT) instanceof
      PrismaNotificationRepositoryAdapter,
  );
  assert.ok(
    providerValue(module, NotificationProjectionConsumerV1) instanceof
      NotificationProjectionConsumerV1,
  );
  assert.ok(
    providerValue(module, DDA_NOTIFICATION_OUTBOX_CONSUMER) instanceof NotificationOutboxConsumerV1,
  );
  assert.ok(
    providerValue(module, DDA_NOTIFICATION_OUTBOX_WORKER) instanceof
      NotificationOutboxProjectionWorkerV1,
  );
});

void test('[NCO-004][NCO-005] canonical dashboard authorization is the notification resource resolver', () => {
  const authorization = {
    authorizeDashboardAction: async () => ({
      allowed: true,
      grantsDatasetAccess: true,
    }),
    projectVisibleFields: async () => [],
  } satisfies DashboardAuthorizationPortV1;
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    dashboardAuthorization: authorization,
  });

  assert.ok(
    providerValue(module, DDA_NOTIFICATION_RESOURCE_AUTHORIZATION) instanceof
      DashboardNotificationResourceAuthorizationAdapter,
  );
});

void test('[NCO-001] notification persistence remains unavailable without a database', () => {
  const module = DdaModule.register({ runtimeMode: 'test', allowInMemoryAdapters: true });
  assert.ok(
    providerValue(module, DDA_NOTIFICATION_REPOSITORY_PORT) instanceof
      UnavailableNotificationRepositoryAdapter,
  );
});

void test('[DDA-032][DDA-036] production rejects a custom coordinator that could bypass the durable outbox', () => {
  assert.throws(
    () =>
      DdaModule.register({
        runtimeMode: 'production',
        ddaDatabase: {} as DdaDatabaseClientV1,
        refreshCoordinator: new InMemoryRefreshCoordinatorAdapter(),
      }),
    (error: unknown) =>
      error instanceof Error && error.message === 'DDA_PRODUCTION_REFRESH_OUTBOX_REQUIRED',
  );
});

void test('[DDA-036] test/dev factory may keep explicit in-memory adapters without database', () => {
  const module = DdaModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
  });
  assert.equal(module.module, DdaModule);
  assert.ok(Array.isArray(module.providers));
});

void test('[DDA-060] module composes explicit server-owned authority, usage, executor, and provider ports', () => {
  const authority = {
    authorize: async () => ({ allowed: false as const, code: 'UNAUTHORIZED' as const }),
  } satisfies AgentAuthorityPortV1;
  const usage = {
    admit: async () => ({ allowed: false as const, code: 'BUDGET_DENIED' as const }),
  } satisfies AgentUsagePortV1;
  const executor = {
    execute: async () => ({ accepted: false as const, code: 'UNAUTHORIZED' as const }),
  } satisfies AgentToolExecutorPortV1;
  const provider = {
    completeTurn: async () => ({ accepted: false as const, code: 'PROVIDER_DISABLED' as const }),
  };
  const module = DdaModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    agentAuthority: authority,
    agentUsage: usage,
    agentToolExecutor: executor,
    agentProvider: provider,
  });

  assert.equal(providerValue(module, AGENT_AUTHORITY_PORT), authority);
  assert.equal(providerValue(module, AGENT_USAGE_PORT), usage);
  assert.equal(providerValue(module, AGENT_TOOL_EXECUTOR_PORT), executor);
  assert.equal(providerValue(module, AGENT_PROVIDER_PORT), provider);
});

void test('[DDA-026][DDA-033][DDA-034] module composes server-owned dashboard HTTP authorities', () => {
  const authorization = {
    authorizeDashboardAction: async () => ({
      allowed: false,
      grantsDatasetAccess: false,
    }),
    projectVisibleFields: async () => [],
  } satisfies DashboardAuthorizationPortV1;
  const results = {
    read: async () => ({ accepted: false as const, code: 'UNAVAILABLE' as const }),
  } satisfies DashboardResultReaderPortV1;
  const projection = {
    resolve: async () => ({ accepted: false as const, code: 'UNAVAILABLE' as const }),
  } satisfies DashboardPermissionProjectionPortV1;

  const module = DdaModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    dashboardAuthorization: authorization,
    dashboardResultReader: results,
    dashboardPermissionProjection: projection,
  });

  assert.equal(providerValue(module, DASHBOARD_AUTHORIZATION_PORT), authorization);
  assert.equal(providerValue(module, DASHBOARD_RESULT_READER_PORT), results);
  assert.equal(providerValue(module, DASHBOARD_PERMISSION_PROJECTION_PORT), projection);
});

void test('[DDA-001][DDA-015][DDA-026] production root composes IAM/DSM/catalog/result/engine adapters only from public ports', () => {
  const iam = {
    findMembership: async () => undefined,
  } as unknown as IamRepositoryPortV1;
  const datasets = {
    find: async () => undefined,
  } as unknown as DatasetVersionRepositoryPortV1;
  const datasetAuthorization = {
    authorize: async () => ({
      accepted: false as const,
      code: 'AUTHORIZATION_UNAVAILABLE' as const,
    }),
  } satisfies GovernedDatasetAuthorizationPortV1;
  const analysisPlans = {
    findByVersionId: async () => undefined,
  } as unknown as AnalysisPlanRepositoryPortV1;
  const catalogSource: AnalysisCatalogMetadataSourcePortV1 = {
    load: async () => undefined,
  };
  const engine: DeterministicAnalysisEnginePortV1 = {
    execute: async (): Promise<DeterministicResultResponseV1> => ({
      status: 'ADAPTER_UNAVAILABLE',
    }),
  };
  const manifests = {
    find: async () => undefined,
  } as unknown as ResultManifestRepositoryPortV1;
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    iamRepository: iam,
    accessPresetService: new AccessPresetService(),
    datasetVersionRepository: datasets,
    governedDatasetAuthorization: datasetAuthorization,
    analysisPlanRepository: analysisPlans,
    analysisCatalogSource: catalogSource,
    analysisEngine: engine,
    resultManifestRepository: manifests,
  });
  assert.ok(
    providerValue(module, DASHBOARD_AUTHORIZATION_PORT) instanceof
      IamDashboardAuthorizationAdapterV1,
  );
  assert.ok(
    providerValue(module, DASHBOARD_PERMISSION_PROJECTION_PORT) instanceof
      DashboardPermissionProjectionAdapterV1,
  );
  assert.ok(
    providerValue(module, DASHBOARD_RESULT_READER_PORT) instanceof
      DashboardMaterializedResultReaderAdapterV1,
  );
  assert.ok(
    providerValue(module, ANALYSIS_CATALOG_AUTHORITY_PORT) instanceof
      IamDsmAnalysisCatalogAuthorityAdapterV1,
  );
  const deterministic = providerValue(module, DETERMINISTIC_RESULT_PORT);
  assert.ok(deterministic instanceof PublicPortDeterministicResultAdapterV1);
});

void test('[DDA-060] omitted agent composition remains fail closed and uses resolved runtime mode', () => {
  const authorityModule = DdaModule.register({ runtimeMode: 'test', allowInMemoryAdapters: true });
  assert.ok(
    providerValue(authorityModule, AGENT_AUTHORITY_PORT) instanceof FailClosedAgentAuthorityAdapter,
  );
  assert.ok(
    providerValue(authorityModule, AGENT_USAGE_PORT) instanceof FailClosedAgentUsageAdapter,
  );
  assert.ok(
    providerValue(authorityModule, AGENT_TOOL_EXECUTOR_PORT) instanceof
      FailClosedAgentToolExecutorAdapter,
  );
  assert.ok(
    providerValue(authorityModule, AGENT_PROVIDER_PORT) instanceof DisabledAgentProviderAdapter,
  );

  const priorNodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    const productionMode = DdaModule.register({ allowInMemoryAdapters: true });
    const agentProvider = providerValue(productionMode, AGENT_PROVIDER_PORT);
    assert.ok(agentProvider instanceof DisabledAgentProviderAdapter);
  } finally {
    if (priorNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = priorNodeEnv;
  }
});

void test('[DDA-015][DDA-043] local/server composition selects the opt-in OpenAI analysis adapter', () => {
  const priorEnabled = process.env['DATABREEZE_OPENAI_ANALYSIS_ENABLED'];
  const priorKey = process.env['OPENAI_API_KEY'];
  process.env['DATABREEZE_OPENAI_ANALYSIS_ENABLED'] = 'true';
  process.env['OPENAI_API_KEY'] = ['sk', 'test', 'analysis-composition-key-cccccccc'].join('-');
  try {
    const module = DdaModule.register({ runtimeMode: 'production', allowInMemoryAdapters: true });
    const proposalService = providerValue(module, AnalysisProposalServiceV1);
    assert.ok(proposalService instanceof AnalysisProposalServiceV1);
    const adapter = (proposalService as unknown as { readonly adapter?: unknown }).adapter;
    assert.ok(adapter instanceof OpenAiAnalysisAdapter);
  } finally {
    if (priorEnabled === undefined) delete process.env['DATABREEZE_OPENAI_ANALYSIS_ENABLED'];
    else process.env['DATABREEZE_OPENAI_ANALYSIS_ENABLED'] = priorEnabled;
    if (priorKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = priorKey;
  }
});
