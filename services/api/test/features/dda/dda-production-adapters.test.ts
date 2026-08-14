/* eslint-disable @typescript-eslint/require-await -- public-port doubles mirror async authorities. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
  createDashboardVersionV1,
  createDdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { createResultManifestV1 } from '@databreeze/domain/result-manifest/v1';
import { computeDashboardPublicationInputSelectorHashV1 } from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import {
  DashboardMaterializedResultReaderAdapterV1,
  DashboardPermissionProjectionAdapterV1,
  IamDashboardAuthorizationAdapterV1,
  PublicPortDeterministicResultAdapterV1,
} from '../../../src/platform/dda-dashboard.composition.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import type { IamRepositoryPortV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { DatasetVersionRepositoryPortV1 } from '../../../src/features/dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../../src/features/dsm/application/governed-dataset-authorization.port.js';
import type { DashboardRepositoryPortV1 } from '../../../src/features/dda/application/dashboard-repository.port.js';
import type { RefreshRepositoryPortV1 } from '../../../src/features/dda/application/refresh-repository.port.js';
import type { AnalysisPlanRepositoryPortV1 } from '../../../src/features/dda/application/analysis-plan-repository.port.js';
import type { DdaIaePortV1 } from '../../../src/features/dda/application/foundation-ports.js';
import type { AnalysisCatalogAuthorityPortV1 } from '../../../src/features/dda/analyst/application/analysis-catalog.port.js';
import { AnalysisExecutionServiceV1 } from '../../../src/features/dda/analyst/application/analysis-execution.service.js';
import { DashboardQueryControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-query.controller.js';
import { DashboardQueryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-query.service.js';
import { DashboardWorkspaceHistoryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-workspace-history.service.js';
import {
  PrismaDashboardWorkspaceHistoryAdapter,
  type DdaDashboardWorkspaceHistoryDatabaseClientV1,
} from '../../../src/features/dda/dashboard/adapter/prisma-dashboard-workspace-history.adapter.js';
import { withRefreshSnapshotBindingProof } from './refresh-snapshot-fixture.js';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-00000000a001',
  workspace: '00000000-0000-4000-8000-00000000a002',
  project: '00000000-0000-4000-8000-00000000a003',
  actor: '00000000-0000-4000-8000-00000000a004',
  dashboard: '00000000-0000-4000-8000-00000000a005',
  version: '00000000-0000-4000-8000-00000000a006',
  snapshot: '00000000-0000-4000-8000-00000000a007',
  page: '00000000-0000-4000-8000-00000000f009',
  widget: '00000000-0000-4000-8000-00000000f001',
  plan: '00000000-0000-4000-8000-00000000f002',
  dataset: '00000000-0000-4000-8000-00000000f003',
  semantic: '00000000-0000-4000-8000-00000000f004',
  metric: '00000000-0000-4000-8000-00000000f005',
  policy: '00000000-0000-4000-8000-00000000f006',
  manifest: '00000000-0000-4000-8000-00000000f007',
  definition: '00000000-0000-4000-8000-00000000f008',
  permission: '00000000-0000-4000-8000-00000000f010',
  output: '00000000-0000-4000-8000-00000000f011',
  cell: '00000000-0000-4000-8000-00000000f012',
  correlation: '00000000-0000-4000-8000-00000000a008',
});

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_ID_INVALID');
  return parsed.value;
}

const scope: TenantScopeV1 = Object.freeze({
  scopeType: 'project',
  organizationId: stable(ids.organization),
  workspaceId: stable(ids.workspace),
  projectId: stable(ids.project),
});

const contextResult = createIamTenantContextV1({
  actorId: stable(ids.actor),
  tenantScope: scope,
  authorizationEpoch: 9,
  correlationId: stable(ids.correlation),
  idempotencyKey: 'dda-production-adapters',
});
assert.equal(contextResult.accepted, true);
if (!contextResult.accepted) throw new Error('TEST_CONTEXT_INVALID');
const context = contextResult.value;

function dashboardVersion() {
  const created = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope: scope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Tong quan', en: 'Overview' },
        layout: {
          desktop: [{ widgetId: ids.widget, x: 0, y: 0, w: 12, h: 4 }],
          tablet: [{ widgetId: ids.widget, x: 0, y: 0, w: 12, h: 4 }],
          mobile: [{ widgetId: ids.widget, x: 0, y: 0, w: 12, h: 4 }],
        },
      },
    ],
    widgets: [
      {
        widgetId: ids.widget,
        type: 'TABLE',
        pageId: ids.page,
        title: { vi: 'Doanh thu', en: 'Revenue' },
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.definition,
        },
      },
    ],
    filters: [],
    datasetBindings: [
      {
        datasetVersionId: ids.dataset,
        semanticVersionId: ids.semantic,
        metricVersionId: ids.metric,
      },
    ],
    locale: 'vi-VN',
    timezone: 'Asia/Bangkok',
    freshnessPolicy: 'MANUAL',
    publicationPolicy: 'DRAFT_ONLY',
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-08-13T10:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_DASHBOARD_VERSION_INVALID');
  return created.value;
}

const version = dashboardVersion();

function snapshot() {
  const materializationIds = [stable(ids.manifest)];
  const inputSelectorHash = computeDashboardPublicationInputSelectorHashV1(
    stable(ids.version),
    materializationIds,
  );
  const base = {
    snapshotId: stable(ids.snapshot),
    tenantScope: scope,
    dashboardVersionId: stable(ids.version),
    materializationIds,
    inputSelectorHash,
    permissionProjectionVersionId: stable(ids.permission),
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: version.createdAt,
  };
  const canonicalHash = computeDashboardSnapshotHashV1(base);
  const created = createDashboardSnapshotV1({ ...base, canonicalHash });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_SNAPSHOT_INVALID');
  return withRefreshSnapshotBindingProof(created.value);
}

const dashboardSnapshot = snapshot();

function analysisPlan() {
  const created = createDdaAnalysisPlanV1({
    planId: ids.plan,
    planVersionId: ids.plan,
    tenantScope: scope,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    dimensions: ['region'],
    filters: [],
    timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    timeGrain: 'MONTH',
    joins: [],
    units: { amount: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 10 },
    assumptions: [],
    estimate: { cpuMs: 1, memoryMb: 1 },
    permissionProjectionVersionId: ids.permission,
    planHash: 'b'.repeat(64),
    createdAt: '2026-08-13T10:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_PLAN_INVALID');
  return created.value;
}

const plan = analysisPlan();

const datasetVersion = {
  schemaVersion: 1 as const,
  datasetId: stable(ids.dashboard),
  versionId: stable(ids.dataset),
  tenantScope: scope,
  inputArtifactVersionIds: [],
  schemaVersionId: stable(ids.semantic),
  mappingVersionId: stable(ids.semantic),
  ruleSetVersionId: stable(ids.metric),
  engineBuild: 'engine-test',
  contentFingerprint: 'c'.repeat(64),
  rowCount: 1,
  qualityState: 'PASS' as const,
  lineageManifestHash: 'd'.repeat(64),
};

interface SecurityFixtureV1 {
  role: 'viewer' | 'analyst';
  membershipActive: boolean;
  datasetScope: TenantScopeV1;
  readonly iam: IamRepositoryPortV1;
  readonly datasets: DatasetVersionRepositoryPortV1;
  readonly datasetAuthorization: GovernedDatasetAuthorizationPortV1;
}

function securityFixture(): SecurityFixtureV1 {
  const fixture: Pick<SecurityFixtureV1, 'role' | 'membershipActive' | 'datasetScope'> = {
    role: 'viewer',
    membershipActive: true,
    datasetScope: scope,
  };
  const iam = {
    findMembership: async () => ({
      id: stable(ids.actor),
      principalId: stable(ids.actor),
      scope,
      roleId: fixture.role,
      status: fixture.membershipActive ? ('ACTIVE' as const) : ('REMOVED' as const),
      revision: 1,
    }),
  } as unknown as IamRepositoryPortV1;
  const datasets = {
    find: async () => ({ ...datasetVersion, tenantScope: fixture.datasetScope }),
  } as unknown as DatasetVersionRepositoryPortV1;
  const datasetAuthorization: GovernedDatasetAuthorizationPortV1 = {
    authorize: async () =>
      fixture.membershipActive
        ? Object.freeze({ accepted: true as const, value: true as const })
        : Object.freeze({ accepted: false as const, code: 'MEMBERSHIP_REVOKED' as const }),
  };
  return Object.assign(fixture, { iam, datasets, datasetAuthorization });
}

const identity = {
  dashboardId: ids.dashboard,
  tenantScope: scope,
  title: { vi: 'Tong quan', en: 'Overview' },
  status: 'PUBLISHED' as const,
  publishedVersionId: ids.version,
  revision: 1,
};

const dashboards = {
  findByDashboardId: async () => identity,
  findVersion: async (_scope: TenantScopeV1, versionId: string) =>
    versionId === ids.version ? version : undefined,
} as unknown as DashboardRepositoryPortV1;

const refresh = {
  findSnapshot: async (_scope: TenantScopeV1, snapshotId: string) =>
    snapshotId === ids.snapshot ? dashboardSnapshot : undefined,
  findLatestSnapshotForDashboard: async () => dashboardSnapshot,
} as unknown as RefreshRepositoryPortV1;

const planRepository = {
  findByVersionId: async () => plan,
} as unknown as AnalysisPlanRepositoryPortV1;

const catalogAuthority: AnalysisCatalogAuthorityPortV1 = {
  load: async (requestContext, request) =>
    tenantScopesEqualV1(requestContext.tenantScope, scope) &&
    request.memberId === requestContext.actorId
      ? Object.freeze({
          status: 'AUTHORIZED' as const,
          catalog: Object.freeze({
            tenantScope: scope,
            memberId: requestContext.actorId,
            authorizationEpoch: requestContext.authorizationEpoch,
            versionState: 'CURRENT' as const,
            datasetVersionId: stable(ids.dataset),
            semanticVersionId: stable(ids.semantic),
            metricVersionId: stable(ids.metric),
            permissionProjectionVersionId: stable(ids.permission),
            authorizedFields: Object.freeze(['region', 'amount']),
            authorizedJoins: Object.freeze([]),
            units: Object.freeze({ amount: 'VND' }),
            grains: Object.freeze(['MONTH']),
          }),
        })
      : Object.freeze({ status: 'RESTRICTED' as const }),
};

function authorization(fixture: SecurityFixtureV1 = securityFixture()) {
  return new IamDashboardAuthorizationAdapterV1({
    iam: fixture.iam,
    accessPresets: new AccessPresetService(),
    datasets: fixture.datasets,
    datasetAuthorization: fixture.datasetAuthorization,
    refresh,
    dashboards,
    analysisPlans: planRepository,
    catalogs: catalogAuthority,
  });
}

void test('[IAM-002][DDA-026][DSM-018] Viewer is denied edit, revocation is immediate, and foreign dataset scope is denied', async () => {
  const fixture = securityFixture();
  const adapter = authorization(fixture);
  const view = await adapter.authorizeDashboardAction({
    context,
    tenantScope: scope,
    actorId: context.actorId,
    dashboardId: ids.dashboard,
    action: 'VIEW',
  });
  assert.equal(view.allowed, true);
  assert.equal(view.grantsDatasetAccess, false);

  const edit = await adapter.authorizeDashboardAction({
    context,
    tenantScope: scope,
    actorId: context.actorId,
    dashboardId: ids.dashboard,
    action: 'EDIT',
  });
  assert.equal(edit.allowed, false);

  fixture.role = 'analyst';
  const analystEdit = await adapter.authorizeDashboardAction({
    context,
    tenantScope: scope,
    actorId: context.actorId,
    dashboardId: ids.dashboard,
    action: 'EDIT',
  });
  assert.equal(analystEdit.allowed, true);
  assert.equal(analystEdit.grantsDatasetAccess, true);

  fixture.membershipActive = false;
  const revoked = await adapter.authorizeDashboardAction({
    context,
    tenantScope: scope,
    actorId: context.actorId,
    dashboardId: ids.dashboard,
    action: 'VIEW',
  });
  assert.equal(revoked.allowed, false);

  fixture.membershipActive = true;
  fixture.datasetScope = Object.freeze({
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.project).replace(/.$/u, '4') as StableIdentifierV1,
  });
  const foreign = await adapter.authorizeDashboardAction({
    context,
    tenantScope: scope,
    actorId: context.actorId,
    dashboardId: ids.dashboard,
    action: 'VIEW',
  });
  assert.equal(foreign.allowed, false);
});

function resultManifest(bytes: Uint8Array) {
  const outputHash = createHash('sha256').update(bytes).digest('hex');
  const created = createResultManifestV1({
    resultManifestId: ids.manifest,
    jobId: ids.plan,
    attemptId: ids.definition,
    tenantScope: scope,
    sourceArtifactVersionIds: [],
    outputIds: [ids.output],
    outputHashes: [outputHash],
    evidenceCoverage: 'COMPLETE',
    handlerDigest: 'e'.repeat(64),
    engineVersion: 'engine-test',
    attemptNumber: 1,
    approvalState: 'NOT_REQUIRED',
    manifestHash: 'f'.repeat(64),
    generatedAt: '2026-08-13T10:01:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_MANIFEST_INVALID');
  return created.value;
}

void test('[DDA-026][DDA-029][JRA-012] production result composition reads exact manifest bytes and projects current fields', async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ rows: [{ region: 'North', amount: 12 }] }),
  );
  const manifest = resultManifest(bytes);
  const authorizationAdapter = authorization();
  const projection = new DashboardPermissionProjectionAdapterV1({
    refresh,
    analysisPlans: planRepository,
    catalogs: catalogAuthority,
    authorization: authorizationAdapter,
  });
  const resultReader = new DashboardMaterializedResultReaderAdapterV1({
    refresh,
    dashboards,
    manifests: {
      find: async () => manifest,
    } as never,
    iae: {
      requireArtifactVersion: async () => undefined,
      requireEvidenceReference: async () => undefined,
      addRetentionConstraint: async () => undefined,
      openProcessingContent: async () =>
        Object.freeze({
          accepted: true as const,
          value: Object.freeze({
            artifactVersionId: stable(ids.output),
            tenantScope: scope,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType: 'application/json',
            byteLength: bytes.byteLength,
            bytes,
          }),
        }),
    } satisfies DdaIaePortV1,
    authorization: authorizationAdapter,
    projection,
  });
  const controller = new DashboardQueryControllerV1(
    new DashboardQueryServiceV1(authorizationAdapter),
    { resolve: async () => context },
    resultReader,
    projection,
  );
  const viewed = await controller.view(
    { body: { snapshotId: ids.snapshot } },
    { snapshotId: ids.snapshot },
  );
  assert.equal(viewed.accepted, true);
  if (viewed.accepted) assert.deepEqual(viewed.value.rows, [{ region: 'North', amount: '12' }]);
});

void test('[DDA-026][DDA-055][DDA-015] one authorized dataset/version journey reaches dashboard read, history, and deterministic analysis', async () => {
  const authorizationAdapter = authorization();
  const dashboardHistoryRow = {
    id: ids.dashboard,
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.project,
    titleVi: 'Tong quan',
    titleEn: 'Overview',
    status: 'PUBLISHED',
    updatedAt: new Date('2026-08-13T10:01:00.000Z'),
  };
  const analysisHistoryRow = {
    id: ids.plan,
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.project,
    createdAt: new Date('2026-08-13T10:00:00.000Z'),
  };
  const historyDatabase: DdaDashboardWorkspaceHistoryDatabaseClientV1 = {
    dashboardRecord: {
      findMany: async () => [dashboardHistoryRow],
      findFirst: async ({ where }) => (where['id'] === ids.dashboard ? dashboardHistoryRow : null),
    },
    analysisPlanRecord: {
      findMany: async () => [analysisHistoryRow],
      findFirst: async ({ where }) => (where['id'] === ids.plan ? analysisHistoryRow : null),
    },
  };
  const history = new DashboardWorkspaceHistoryServiceV1(
    new PrismaDashboardWorkspaceHistoryAdapter(
      historyDatabase,
      authorizationAdapter,
      catalogAuthority,
      planRepository,
    ),
  );
  const historyPage = await history.list(context, {});
  assert.equal(historyPage.accepted, true);
  if (historyPage.accepted) assert.equal(historyPage.value.items.length, 2);

  const deterministic = new PublicPortDeterministicResultAdapterV1({
    catalogs: catalogAuthority,
    dsm: {
      requireDatasetVersion: async () => undefined,
      requireSemanticVersion: async () => undefined,
      requireMetricVersion: async () => undefined,
    },
    jra: {
      requireJob: async () => undefined,
      requireResultManifest: async () => undefined,
    },
    engine: {
      execute: async () =>
        Object.freeze({
          resultId: ids.manifest,
          cells: Object.freeze([
            Object.freeze({
              cellId: ids.cell,
              field: 'amount',
              value: 12,
              unit: 'VND',
              planVersionId: ids.plan,
              metricVersionId: ids.metric,
            }),
          ]),
          provenance: Object.freeze({
            planVersionId: ids.plan,
            datasetVersionId: ids.dataset,
            engineVersion: 'engine-test',
          }),
        }),
    },
    analysisPlanRepository: planRepository,
  });
  const executed = await new AnalysisExecutionServiceV1(deterministic).execute(context, {
    plan,
    narrativeClaims: [{ text: 'Doanh thu', resultCellIds: [ids.cell] }],
  });
  assert.equal(executed.accepted, true);
  if (executed.accepted) assert.equal(executed.value.cells[0]?.value, 12);
});
