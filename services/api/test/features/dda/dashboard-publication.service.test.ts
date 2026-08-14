/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDdaMaterializationV1,
  createDashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';

import { DashboardPublicationServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication.service.js';
import type { DashboardPublicationDependenciesV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication.service.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import {
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
} from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import { InMemoryDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import { DashboardPublicationApprovalInvalidationDispatcherV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation.dispatcher.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { buildMaterializationCacheKeyV1 } from '../../../src/features/dda/refresh/application/materialization-cache-key.js';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

function stableIdentifier(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(`invalid test identifier: ${value}`);
  return parsed.value;
}

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: stableIdentifier('00000000-0000-4000-8000-000000000001'),
  workspaceId: stableIdentifier('00000000-0000-4000-8000-000000000002'),
  projectId: stableIdentifier('00000000-0000-4000-8000-000000000003'),
});

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-dashboard-publication',
  expectedRevision: 1,
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const hash = 'a'.repeat(64);
const ids = Object.freeze({
  dashboard: '00000000-0000-4000-8000-00000000001b',
  version: '00000000-0000-4000-8000-000000000011',
  page: '00000000-0000-4000-8000-00000000001c',
  widget: '00000000-0000-4000-8000-00000000001d',
  filter: '00000000-0000-4000-8000-00000000001e',
  plan: '00000000-0000-4000-8000-000000000010',
  materialization: '00000000-0000-4000-8000-00000000001f',
  dataset: '00000000-0000-4000-8000-000000000018',
  semantic: '00000000-0000-4000-8000-000000000019',
  metric: '00000000-0000-4000-8000-00000000001a',
  permission: '00000000-0000-4000-8000-000000000021',
  serverMaterialization: '00000000-0000-4000-8000-00000000002f',
  serverResultManifest: '00000000-0000-4000-8000-000000000030',
  serverPolicy: '00000000-0000-4000-8000-000000000031',
});

function versionInput(
  overrides: {
    readonly publicationPolicy?: 'DRAFT_ONLY' | 'REVIEWED' | 'CERTIFIED';
    readonly versionId?: string;
  } = {},
) {
  return {
    dashboardId: ids.dashboard,
    versionId: overrides.versionId ?? ids.version,
    tenantScope: scope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh so', en: 'Sales' },
        layout: {
          desktop: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          tablet: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          mobile: [{ widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 }],
        },
      },
    ],
    widgets: [
      {
        widgetId: ids.widget,
        type: 'KPI',
        pageId: ids.page,
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.materialization,
        },
        title: { vi: 'Tong doanh so', en: 'Total sales' },
      },
    ],
    filters: [{ filterId: ids.filter, field: 'region', operator: 'IN', scope: 'DASHBOARD' }],
    datasetBindings: [
      {
        datasetVersionId: ids.dataset,
        semanticVersionId: ids.semantic,
        metricVersionId: ids.metric,
      },
    ],
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    freshnessPolicy: 'ON_CHANGE',
    publicationPolicy: overrides.publicationPolicy ?? 'REVIEWED',
    canonicalHash: hash,
    createdAt: '2026-08-10T10:00:00.000Z',
  };
}

function auth(overrides: Partial<DashboardAuthorizationPortV1> = {}): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction() {
      return Promise.resolve(Object.freeze({ allowed: true, grantsDatasetAccess: false }));
    },
    projectVisibleFields() {
      return Promise.resolve(Object.freeze(['region', 'amount']));
    },
    ...overrides,
  };
}

function materializationFor(
  materializationId: string = ids.materialization,
  overrides: Partial<
    Record<
      | 'analysisPlanVersionId'
      | 'datasetVersionId'
      | 'semanticVersionId'
      | 'metricVersionId'
      | 'locale'
      | 'timezone'
      | 'cacheIdentityHash',
      string
    >
  > = {},
) {
  const cacheIdentityHash =
    overrides.cacheIdentityHash ??
    (() => {
      const result = buildMaterializationCacheKeyV1({
        tenantScope: context.tenantScope,
        dashboardVersionId: ids.version,
        widgetId: ids.widget,
        analysisPlanVersionId: overrides.analysisPlanVersionId ?? ids.plan,
        datasetVersionId: overrides.datasetVersionId ?? ids.dataset,
        semanticVersionId: overrides.semanticVersionId ?? ids.semantic,
        metricVersionId: overrides.metricVersionId ?? ids.metric,
        permissionProjectionVersionId: ids.permission,
        parameterHash: 'b'.repeat(64),
        locale: overrides.locale ?? 'vi-VN',
        timezone: overrides.timezone ?? 'Asia/Ho_Chi_Minh',
        engineVersion: 'engine-1',
        adapterVersion: 'adapter-1',
        effectivePolicyVersionId: ids.serverPolicy,
      });
      assert.equal(result.complete, true);
      if (!result.complete) throw new Error('invalid cache identity fixture');
      return result.cacheIdentityHash;
    })();
  const created = createDdaMaterializationV1({
    materializationId,
    tenantScope: scope,
    dashboardVersionId: ids.version,
    widgetId: ids.widget,
    analysisPlanVersionId: overrides.analysisPlanVersionId ?? ids.plan,
    datasetVersionId: overrides.datasetVersionId ?? ids.dataset,
    semanticVersionId: overrides.semanticVersionId ?? ids.semantic,
    metricVersionId: overrides.metricVersionId ?? ids.metric,
    permissionProjectionVersionId: ids.permission,
    parameterHash: 'b'.repeat(64),
    locale: overrides.locale ?? 'vi-VN',
    timezone: overrides.timezone ?? 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-1',
    adapterVersion: 'adapter-1',
    effectivePolicyVersionId: ids.serverPolicy,
    resultManifestId: ids.serverResultManifest,
    cacheIdentityHash,
    createdAt: '2026-08-10T10:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid server materialization fixture');
  return created.value;
}

function bindingProofFor(
  materialization: ReturnType<typeof materializationFor>,
): readonly DashboardPublicationMaterializationBindingProofV1[] {
  return [
    {
      schemaVersion: materialization.schemaVersion,
      materializationId: materialization.materializationId,
      tenantScope: materialization.tenantScope,
      dashboardVersionId: materialization.dashboardVersionId,
      widgetId: materialization.widgetId,
      analysisPlanVersionId: materialization.analysisPlanVersionId,
      datasetVersionId: materialization.datasetVersionId,
      semanticVersionId: materialization.semanticVersionId,
      metricVersionId: materialization.metricVersionId,
      materializationDefinitionId: ids.materialization as never,
      resultManifestId: materialization.resultManifestId,
      permissionProjectionVersionId: materialization.permissionProjectionVersionId,
      parameterHash: materialization.parameterHash,
      locale: materialization.locale,
      timezone: materialization.timezone,
      engineVersion: materialization.engineVersion,
      adapterVersion: materialization.adapterVersion,
      effectivePolicyVersionId: materialization.effectivePolicyVersionId,
      cacheIdentityHash: materialization.cacheIdentityHash,
      materializationCreatedAt: materialization.createdAt,
    },
  ] as const;
}

function publicationDependencies(
  materialization = materializationFor(),
  bindingProof = bindingProofFor(materialization),
): DashboardPublicationDependenciesV1 {
  return {
    materializations: {
      resolvePublicationMaterializations: async () => ({
        accepted: true as const,
        value: {
          materializations: [materialization],
          bindingProof,
          freshnessState: 'FRESH' as const,
          evidenceState: 'AVAILABLE' as const,
        },
      }),
    },
    audience: {
      authorizePublicationAudience: async () => ({ allowed: true }),
    },
    approvals: {
      findCurrentPublicationApproval: async (input) => ({
        accepted: true as const,
        value: {
          approvalId: '00000000-0000-4000-8000-000000000032',
          tenantScope: context.tenantScope,
          subjectType: 'DASHBOARD_VERSION' as const,
          subjectId: ids.dashboard,
          versionId: ids.version,
          canonicalHash: hash,
          action: 'PUBLISH' as const,
          audience: input.audience,
          state: 'APPROVED' as const,
        },
      }),
      preparePublicationApprovalInvalidation: async (input) => ({
        accepted: true as const,
        value: input,
      }),
    },
    auditOutbox: {
      preparePublicationAudit: async (input) => ({
        accepted: true as const,
        value: {
          actorId: input.context.actorId,
          correlationId: input.context.correlationId,
          authorizationEpoch: input.context.authorizationEpoch,
          ...(input.approvalId === undefined ? {} : { approvalId: input.approvalId }),
        },
      }),
    },
  };
}

function serverMaterialization() {
  return materializationFor(ids.serverMaterialization);
}

void test('[DDA-025] publish creates immutable snapshot bound to one dashboard version', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const service = new DashboardPublicationServiceV1(repo, auth(), publicationDependencies());
  const published = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  assert.equal(published.value.dashboardVersionId, ids.version);
  assert.equal(published.value.audience, 'WORKSPACE_VIEWERS');
  assert.equal(published.value.canonicalHash.length, 64);
  assert.equal(
    published.value.canonicalHash,
    computeDashboardPublicationCanonicalHashV1({
      snapshot: published.value,
      bindingProof: bindingProofFor(materializationFor()),
    }),
  );
  assert.notEqual(
    published.value.canonicalHash,
    computeDashboardSnapshotHashV1({
      snapshotId: published.value.snapshotId as never,
      tenantScope: published.value.tenantScope,
      dashboardVersionId: published.value.dashboardVersionId as never,
      materializationIds: published.value.materializationIds as never,
      inputSelectorHash: published.value.inputSelectorHash,
      permissionProjectionVersionId: published.value.permissionProjectionVersionId as never,
      audience: published.value.audience,
      freshnessState: published.value.freshnessState,
      evidenceState: published.value.evidenceState,
      createdAt: published.value.createdAt as never,
    }),
  );

  const concurrentRepository = new InMemoryDashboardDraftRepositoryAdapter();
  await concurrentRepository.saveVersion(version.value);
  await concurrentRepository.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const concurrentService = new DashboardPublicationServiceV1(
    concurrentRepository,
    auth(),
    publicationDependencies(),
  );
  const [concurrentFirst, concurrentSecond] = await Promise.all([
    concurrentService.publish(context, {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'WORKSPACE_VIEWERS',
      materializationIds: [ids.materialization],
      permissionProjectionVersionId: ids.permission,
      expectedRevision: 1,
      idempotencyKey: 'concurrent-publish',
    }),
    concurrentService.publish(context, {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'WORKSPACE_VIEWERS',
      materializationIds: [ids.materialization],
      permissionProjectionVersionId: ids.permission,
      expectedRevision: 1,
      idempotencyKey: 'concurrent-publish',
    }),
  ]);
  assert.equal(concurrentFirst.accepted, true);
  assert.equal(concurrentSecond.accepted, true);
  if (concurrentFirst.accepted && concurrentSecond.accepted) {
    assert.equal(concurrentFirst.value.snapshotId, concurrentSecond.value.snapshotId);
  }

  const again = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.equal(again.accepted, true);
  if (again.accepted) assert.equal(again.value.snapshotId, published.value.snapshotId);

  const restartedService = new DashboardPublicationServiceV1(
    repo,
    auth(),
    publicationDependencies(),
  );
  const afterRestart = await restartedService.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.equal(afterRestart.accepted, true);
  if (afterRestart.accepted) {
    assert.equal(afterRestart.value.snapshotId, published.value.snapshotId);
    assert.deepEqual(afterRestart.value, published.value);
  }

  const conflictingReplay = await restartedService.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'OWNER',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.deepEqual(conflictingReplay, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });

  const otherScopeResult = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-0000000000a2',
    tenantScope: {
      scopeType: 'project',
      organizationId: '00000000-0000-4000-8000-000000000101',
      workspaceId: '00000000-0000-4000-8000-000000000102',
      projectId: '00000000-0000-4000-8000-000000000103',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-0000000000c2',
    idempotencyKey: 'dda-dashboard-publication-other-tenant',
    expectedRevision: 1,
  });
  assert.equal(otherScopeResult.accepted, true);
  if (!otherScopeResult.accepted) return;
  const crossTenant = await service.publish(otherScopeResult.value, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.deepEqual(crossTenant, { accepted: false, code: 'VERSION_NOT_FOUND' });

  const stale = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'stale-after-publication',
  });
  assert.deepEqual(stale, { accepted: false, code: 'REVISION_CONFLICT' });

  const sharedLink = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'SHARED_LINK',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 2,
    idempotencyKey: 'shared-link',
  });
  assert.deepEqual(sharedLink, { accepted: false, code: 'INVALID_SNAPSHOT' });
});

void test('[DDA-025] material change invalidates prior approval and requires new subject', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  const priorVersion = createDashboardVersionV1(
    versionInput({ versionId: '00000000-0000-4000-8000-000000000099' }),
  );
  assert.equal(priorVersion.accepted, true);
  if (!priorVersion.accepted) return;
  await repo.saveVersion(priorVersion.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'PUBLISHED',
    draftVersionId: ids.version,
    publishedVersionId: '00000000-0000-4000-8000-000000000099',
    revision: 2,
  });
  const base = publicationDependencies();
  let invalidations = 0;
  const service = new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    approvals: {
      ...base.approvals,
      preparePublicationApprovalInvalidation: async (input) => {
        invalidations += 1;
        return { accepted: true as const, value: input };
      },
    },
  });
  const rejected = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'stale-revision',
    approvalId: '00000000-0000-4000-8000-000000000050',
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.code, 'REVISION_CONFLICT');
  assert.equal(invalidations, 0);
});

void test('[DDA-025][DDA-032] publication ignores caller projection and uses the server resolver', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });

  const serverProjection = serverMaterialization();
  const service = new (DashboardPublicationServiceV1 as unknown as new (
    ...args: any[]
  ) => DashboardPublicationServiceV1)(repo, auth(), {
    materializations: {
      resolvePublicationMaterializations: async () => ({
        accepted: true,
        value: {
          materializations: [serverProjection],
          bindingProof: bindingProofFor(serverProjection),
          freshnessState: 'STALE',
          evidenceState: 'PARTIAL',
        },
      }),
    },
    audience: {
      authorizePublicationAudience: async () => ({ allowed: true }),
    },
    approvals: {
      findCurrentPublicationApproval: async () => ({
        accepted: true,
        value: {
          approvalId: '00000000-0000-4000-8000-000000000032',
          tenantScope: scope,
          subjectType: 'DASHBOARD_VERSION',
          subjectId: ids.dashboard,
          versionId: ids.version,
          canonicalHash: version.value.canonicalHash,
          action: 'PUBLISH',
          audience: 'WORKSPACE_VIEWERS',
          state: 'APPROVED',
        },
      }),
    },
    auditOutbox: {
      preparePublicationAudit: async (input: any) => ({
        accepted: true,
        value: {
          actorId: input.context.actorId,
          correlationId: input.context.correlationId,
          authorizationEpoch: input.context.authorizationEpoch,
          ...(input.approvalId === undefined ? {} : { approvalId: input.approvalId }),
        },
      }),
    },
  });

  const published = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: ['00000000-0000-4000-8000-000000000099'],
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000098',
    expectedRevision: 1,
    idempotencyKey: 'server-owned-projection',
    approvalId: '00000000-0000-4000-8000-000000000032',
  });
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  assert.deepEqual(published.value.materializationIds, [ids.serverMaterialization]);
  assert.equal(published.value.permissionProjectionVersionId, ids.permission);
  assert.equal(published.value.freshnessState, 'STALE');
  assert.equal(published.value.evidenceState, 'PARTIAL');
  assert.equal(
    repo.findRefreshState(context.tenantScope, ids.dashboard)?.lastSnapshotId,
    published.value.snapshotId,
  );
  assert.deepEqual(repo.findPublicationAuditOutbox(), [
    {
      tenantScope: context.tenantScope,
      idempotencyKey: 'server-owned-projection',
      dashboardId: ids.dashboard,
      versionId: ids.version,
      snapshotId: published.value.snapshotId,
      actorId: context.actorId,
      correlationId: context.correlationId,
      authorizationEpoch: context.authorizationEpoch,
      approvalId: '00000000-0000-4000-8000-000000000032',
    },
  ]);
});

void test('[DDA-025] publication is fail-closed when the server resolver is unavailable', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const service = new DashboardPublicationServiceV1(repo, auth());
  const result = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'OWNER',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'resolver-unavailable',
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
});

void test('[DDA-032] publication rejects materializations whose value-affecting bindings differ from the exact version', async () => {
  const mismatches = [
    ['analysis-plan', { analysisPlanVersionId: '00000000-0000-4000-8000-000000000041' }],
    ['dataset', { datasetVersionId: '00000000-0000-4000-8000-000000000042' }],
    ['semantic', { semanticVersionId: '00000000-0000-4000-8000-000000000043' }],
    ['metric', { metricVersionId: '00000000-0000-4000-8000-000000000044' }],
    ['locale', { locale: 'en-US' }],
    ['timezone', { timezone: 'UTC' }],
  ] as const;

  for (const [label, overrides] of mismatches) {
    const repo = new InMemoryDashboardDraftRepositoryAdapter();
    const version = createDashboardVersionV1(versionInput());
    assert.equal(version.accepted, true, label);
    if (!version.accepted) continue;
    await repo.saveVersion(version.value);
    await repo.saveIdentity({
      dashboardId: ids.dashboard,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang', en: 'Dash' },
      status: 'DRAFT',
      draftVersionId: ids.version,
      revision: 1,
    });
    const result = await new DashboardPublicationServiceV1(
      repo,
      auth(),
      publicationDependencies(materializationFor(ids.materialization, overrides)),
    ).publish(context, {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'OWNER',
      expectedRevision: 1,
      idempotencyKey: `binding-mismatch-${label}`,
    });
    assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' }, label);
  }
});

void test('[DDA-032] publication rejects a resolver proof for the wrong definition or cache identity', async () => {
  const materialization = materializationFor();
  const proofCases: readonly (readonly [
    string,
    readonly DashboardPublicationMaterializationBindingProofV1[],
  ])[] = [
    [
      'definition',
      [
        {
          ...bindingProofFor(materialization)[0]!,
          materializationId: materialization.materializationId,
          widgetId: materialization.widgetId,
          materializationDefinitionId: '00000000-0000-4000-8000-000000000041' as never,
          resultManifestId: materialization.resultManifestId,
          permissionProjectionVersionId: materialization.permissionProjectionVersionId,
          cacheIdentityHash: materialization.cacheIdentityHash,
        },
      ],
    ],
    [
      'cache',
      [
        {
          ...bindingProofFor(materialization)[0]!,
          materializationId: materialization.materializationId,
          widgetId: materialization.widgetId,
          materializationDefinitionId: ids.materialization as never,
          resultManifestId: materialization.resultManifestId,
          permissionProjectionVersionId: materialization.permissionProjectionVersionId,
          cacheIdentityHash: 'd'.repeat(64),
        },
      ],
    ],
  ];
  for (const [label, proof] of proofCases) {
    const repo = new InMemoryDashboardDraftRepositoryAdapter();
    const version = createDashboardVersionV1(versionInput());
    assert.equal(version.accepted, true, label);
    if (!version.accepted) continue;
    await repo.saveVersion(version.value);
    await repo.saveIdentity({
      dashboardId: ids.dashboard,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang', en: 'Dash' },
      status: 'DRAFT',
      draftVersionId: ids.version,
      revision: 1,
    });
    const result = await new DashboardPublicationServiceV1(
      repo,
      auth(),
      publicationDependencies(materialization, proof),
    ).publish(context, {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'OWNER',
      expectedRevision: 1,
      idempotencyKey: `binding-proof-${label}`,
    });
    assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' }, label);
  }
});

void test('[DDA-032] publication rejects a materialization whose cache hash was not recomputed canonically', async () => {
  const materialization = materializationFor(ids.materialization, {
    cacheIdentityHash: 'd'.repeat(64),
  });
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const result = await new DashboardPublicationServiceV1(
    repo,
    auth(),
    publicationDependencies(materialization, bindingProofFor(materialization)),
  ).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'OWNER',
    expectedRevision: 1,
    idempotencyKey: 'non-canonical-cache-hash',
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
});

void test('[DDA-025] material-change approval preparation targets the prior published subject', async () => {
  const priorVersionId = '00000000-0000-4000-8000-000000000099';
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput({ publicationPolicy: 'REVIEWED' }));
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  const priorVersion = createDashboardVersionV1(
    versionInput({ versionId: priorVersionId, publicationPolicy: 'REVIEWED' }),
  );
  assert.equal(priorVersion.accepted, true);
  if (!priorVersion.accepted) return;
  await repo.saveVersion(priorVersion.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'PUBLISHED',
    draftVersionId: ids.version,
    publishedVersionId: priorVersionId,
    revision: 1,
  });
  const base = publicationDependencies();
  const invalidationTargets: any[] = [];
  const result = await new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    approvals: {
      ...base.approvals,
      preparePublicationApprovalInvalidation: async (input) => {
        invalidationTargets.push(input);
        return { accepted: true as const, value: input };
      },
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    expectedRevision: 1,
    idempotencyKey: 'prior-subject-invalidation',
  });
  assert.equal(result.accepted, true);
  assert.equal(invalidationTargets.length, 1);
  assert.equal(
    invalidationTargets[0]?.priorPublishedVersionId ?? invalidationTargets[0]?.versionId,
    priorVersionId,
  );
  assert.equal(repo.findPublicationAuditOutbox()[0]?.priorPublishedVersionId, priorVersionId);
  const invalidationReader = repo as unknown as {
    findPublicationApprovalInvalidationOutbox?: () => readonly Record<string, unknown>[];
  };
  const invalidation = invalidationReader.findPublicationApprovalInvalidationOutbox?.()[0];
  assert.equal(invalidation?.['idempotencyKey'], 'prior-subject-invalidation');
  assert.equal(invalidation?.['priorPublishedVersionId'], priorVersionId);
  assert.equal(invalidation?.['action'], 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS');
  assert.equal(invalidation?.['state'], 'PENDING');
  const replay = await new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    approvals: {
      ...base.approvals,
      preparePublicationApprovalInvalidation: async (input) => ({
        accepted: true as const,
        value: input,
      }),
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    expectedRevision: 1,
    idempotencyKey: 'prior-subject-invalidation',
  });
  assert.equal(replay.accepted, true);
  assert.equal(invalidationReader.findPublicationApprovalInvalidationOutbox?.().length, 1);

  const executed: string[] = [];
  const dispatcher = new DashboardPublicationApprovalInvalidationDispatcherV1(repo, {
    invalidatePublicationApproval: async (input) => {
      executed.push(input.priorPublishedVersionId);
      return { accepted: true as const };
    },
  });
  assert.deepEqual(
    await dispatcher.dispatchNext({
      tenantScope: context.tenantScope,
      workerId: 'dda-publication-worker',
      now: new Date('2999-01-01T00:00:00.000Z'),
      leaseDurationMs: 60_000,
      retryDelayMs: 0,
    }),
    { accepted: true, outcome: 'COMPLETED' },
  );
  assert.deepEqual(executed, [priorVersionId]);
});

void test('[DDA-025] successful idempotency replay returns the durable snapshot before mutable materialization or approval lookup', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });

  const base = publicationDependencies();
  let initialMaterializationLookups = 0;
  let initialApprovalLookups = 0;
  const first = await new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    materializations: {
      resolvePublicationMaterializations: async (input) => {
        initialMaterializationLookups += 1;
        return base.materializations.resolvePublicationMaterializations(input);
      },
    },
    approvals: {
      ...base.approvals,
      findCurrentPublicationApproval: async (input) => {
        initialApprovalLookups += 1;
        return base.approvals.findCurrentPublicationApproval(input);
      },
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    expectedRevision: 1,
    idempotencyKey: 'mutable-replay',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(initialMaterializationLookups, 1);
  assert.equal(initialApprovalLookups, 1);

  let replayMaterializationLookups = 0;
  let replayApprovalLookups = 0;
  const replay = await new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    materializations: {
      resolvePublicationMaterializations: async () => {
        replayMaterializationLookups += 1;
        return {
          accepted: true as const,
          value: {
            materializations: [
              materializationFor(ids.materialization, { cacheIdentityHash: 'd'.repeat(64) }),
            ],
            bindingProof: bindingProofFor(
              materializationFor(ids.materialization, { cacheIdentityHash: 'd'.repeat(64) }),
            ),
            freshnessState: 'FRESH' as const,
            evidenceState: 'AVAILABLE' as const,
          },
        };
      },
    },
    approvals: {
      ...base.approvals,
      findCurrentPublicationApproval: async () => {
        replayApprovalLookups += 1;
        return { accepted: false as const, code: 'NOT_FOUND' as const };
      },
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    expectedRevision: 1,
    idempotencyKey: 'mutable-replay',
  });
  assert.equal(replay.accepted, true);
  if (replay.accepted) assert.deepEqual(replay.value, first.value);
  assert.equal(replayMaterializationLookups, 0);
  assert.equal(replayApprovalLookups, 0);
});

void test('[DDA-025] policy matrix fails closed without an exact current approval for every policy', async () => {
  for (const policy of ['DRAFT_ONLY', 'REVIEWED', 'CERTIFIED'] as const) {
    const repo = new InMemoryDashboardDraftRepositoryAdapter();
    const created = createDashboardVersionV1(versionInput({ publicationPolicy: policy }));
    assert.equal(created.accepted, true);
    if (!created.accepted) continue;
    await repo.saveVersion(created.value);
    await repo.saveIdentity({
      dashboardId: ids.dashboard,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang', en: 'Dash' },
      status: 'DRAFT',
      draftVersionId: ids.version,
      revision: 1,
    });
    const dependencies = publicationDependencies();
    const withoutApproval = {
      ...dependencies,
      approvals: {
        ...dependencies.approvals,
        findCurrentPublicationApproval: async () => ({
          accepted: false as const,
          code: 'NOT_FOUND' as const,
        }),
      },
    } satisfies DashboardPublicationDependenciesV1;
    const service = new DashboardPublicationServiceV1(repo, auth(), withoutApproval);
    const result = await service.publish(context, {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'OWNER',
      expectedRevision: 1,
      idempotencyKey: `policy-${policy}`,
    });
    assert.deepEqual(
      result,
      {
        accepted: false,
        code: policy === 'DRAFT_ONLY' ? 'INVALID_SNAPSHOT' : 'APPROVAL_INVALIDATED',
      },
      policy,
    );
  }
});

void test('[DDA-025] DRAFT_ONLY rejects before resolver, approval, or commit even with an approved decision', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const created = createDashboardVersionV1(versionInput({ publicationPolicy: 'DRAFT_ONLY' }));
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await repo.saveVersion(created.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const base = publicationDependencies();
  let resolverCalls = 0;
  let approvalCalls = 0;
  const result = await new DashboardPublicationServiceV1(repo, auth(), {
    ...base,
    materializations: {
      resolvePublicationMaterializations: async (input) => {
        resolverCalls += 1;
        return base.materializations.resolvePublicationMaterializations(input);
      },
    },
    approvals: {
      ...base.approvals,
      findCurrentPublicationApproval: async (input) => {
        approvalCalls += 1;
        return base.approvals.findCurrentPublicationApproval(input);
      },
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'OWNER',
    expectedRevision: 1,
    idempotencyKey: 'draft-only-approved',
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
  assert.equal(resolverCalls, 0);
  assert.equal(approvalCalls, 0);
  assert.equal(repo.findRefreshState(context.tenantScope, ids.dashboard), undefined);
});

void test('[DDA-025][DDA-026] legacy durable DRAFT_ONLY replay is rejected from the authoritative version policy', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const created = createDashboardVersionV1(versionInput({ publicationPolicy: 'DRAFT_ONLY' }));
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await repo.saveVersion(created.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });

  const seeded = await repo.commitPublication({
    tenantScope: context.tenantScope,
    dashboardId: ids.dashboard,
    versionId: ids.version,
    expectedRevision: 1,
    idempotencyKey: 'legacy-draft-only-replay',
    audience: 'OWNER',
    resolvedProjection: {
      materializations: [materializationFor()],
      bindingProof: bindingProofFor(materializationFor()),
      freshnessState: 'FRESH',
      evidenceState: 'AVAILABLE',
    },
    auditMetadata: {
      actorId: context.actorId,
      correlationId: context.correlationId,
      authorizationEpoch: context.authorizationEpoch,
    },
  });
  assert.equal(seeded.accepted, true);

  let mutableResolverCalls = 0;
  const result = await new DashboardPublicationServiceV1(repo, auth(), {
    ...publicationDependencies(),
    materializations: {
      resolvePublicationMaterializations: async () => {
        mutableResolverCalls += 1;
        throw new Error('LEGACY_REPLAY_MUST_NOT_RESOLVE');
      },
    },
  }).publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'OWNER',
    expectedRevision: 1,
    idempotencyKey: 'legacy-draft-only-replay',
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
  assert.equal(mutableResolverCalls, 0);
});

void test('[DDA-025] audience authorization is evaluated independently of PUBLISH permission', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput({ publicationPolicy: 'DRAFT_ONLY' }));
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const base = publicationDependencies();
  let resolved = false;
  const dependencies = {
    ...base,
    audience: { authorizePublicationAudience: async () => ({ allowed: false }) },
    materializations: {
      resolvePublicationMaterializations: async () => {
        resolved = true;
        return base.materializations.resolvePublicationMaterializations({
          context,
          dashboardId: ids.dashboard,
          version: version.value,
          audience: 'OWNER',
        });
      },
    },
  } satisfies DashboardPublicationDependenciesV1;
  const result = await new DashboardPublicationServiceV1(repo, auth(), dependencies).publish(
    context,
    {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'OWNER',
      expectedRevision: 1,
      idempotencyKey: 'audience-denied',
    },
  );
  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
  assert.equal(resolved, false);
});

void test('[DDA-025] incomplete, mixed-scope, and duplicate resolver rows are rejected before commit', async () => {
  const base = publicationDependencies();
  const cases = [
    [],
    [
      Object.freeze({
        ...materializationFor(),
        tenantScope: {
          ...scope,
          organizationId: '00000000-0000-4000-8000-000000000101',
        } as never,
      }),
    ],
    [materializationFor(), materializationFor()],
  ];
  for (const [index, materializations] of cases.entries()) {
    const repo = new InMemoryDashboardDraftRepositoryAdapter();
    const version = createDashboardVersionV1(versionInput({ publicationPolicy: 'DRAFT_ONLY' }));
    assert.equal(version.accepted, true);
    if (!version.accepted) continue;
    await repo.saveVersion(version.value);
    await repo.saveIdentity({
      dashboardId: ids.dashboard,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang', en: 'Dash' },
      status: 'DRAFT',
      draftVersionId: ids.version,
      revision: 1,
    });
    const dependencies = {
      ...base,
      materializations: {
        resolvePublicationMaterializations: async () => ({
          accepted: true as const,
          value: {
            materializations,
            bindingProof: materializations.map(
              (materialization) => bindingProofFor(materialization)[0]!,
            ),
            freshnessState: 'FRESH' as const,
            evidenceState: 'AVAILABLE' as const,
          },
        }),
      },
    } satisfies DashboardPublicationDependenciesV1;
    const result = await new DashboardPublicationServiceV1(repo, auth(), dependencies).publish(
      context,
      {
        dashboardId: ids.dashboard,
        versionId: ids.version,
        audience: 'OWNER',
        expectedRevision: 1,
        idempotencyKey: `invalid-materializations-${index}`,
      },
    );
    assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
    assert.equal(repo.findRefreshState(context.tenantScope, ids.dashboard), undefined);
  }
});

void test('[DDA-025] selector hashes normalize materialization order and duplicates deterministically', () => {
  assert.equal(
    computeDashboardPublicationInputSelectorHashV1(ids.version, [ids.materialization, ids.widget]),
    computeDashboardPublicationInputSelectorHashV1(ids.version, [ids.widget, ids.materialization]),
  );
  assert.equal(
    computeDashboardPublicationInputSelectorHashV1(ids.version, [ids.materialization]),
    computeDashboardPublicationInputSelectorHashV1(ids.version, [
      ids.materialization,
      ids.materialization,
    ]),
  );
});

void test('[DDA-025] material-change invalidation is derived from the published pointer, not caller assertions', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput({ publicationPolicy: 'REVIEWED' }));
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  const priorVersion = createDashboardVersionV1(
    versionInput({
      versionId: '00000000-0000-4000-8000-000000000099',
      publicationPolicy: 'REVIEWED',
    }),
  );
  assert.equal(priorVersion.accepted, true);
  if (!priorVersion.accepted) return;
  await repo.saveVersion(priorVersion.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'PUBLISHED',
    draftVersionId: ids.version,
    publishedVersionId: '00000000-0000-4000-8000-000000000099',
    revision: 1,
  });
  const base = publicationDependencies();
  let invalidations = 0;
  const dependencies = {
    ...base,
    approvals: {
      ...base.approvals,
      preparePublicationApprovalInvalidation: async (input) => {
        invalidations += 1;
        return { accepted: true as const, value: input };
      },
    },
  } satisfies DashboardPublicationDependenciesV1;
  const result = await new DashboardPublicationServiceV1(repo, auth(), dependencies).publish(
    context,
    {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      audience: 'WORKSPACE_VIEWERS',
      expectedRevision: 1,
      idempotencyKey: 'derived-material-change',
    },
  );
  assert.equal(result.accepted, true);
  assert.equal(invalidations, 1);
});
