import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
  type DashboardSnapshotV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  attachDashboardSnapshotBindingProofV1,
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
} from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import { buildMaterializationCacheKeyV1 } from '../../../src/features/dda/refresh/application/materialization-cache-key.js';
import {
  type DashboardRefreshExecutionRowV1,
  PrismaRefreshRepositoryAdapter,
  type DashboardSnapshotCreateV1,
  type DashboardSnapshotRowV1,
  type DdaRefreshDatabaseClientV1,
} from '../../../src/features/dda/adapter/prisma-refresh-repository.adapter.js';
import { InMemoryRefreshRepositoryAdapter } from '../../../src/features/dda/adapter/in-memory-refresh-repository.adapter.js';
import { InMemoryRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.js';

function requireId(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_ID_INVALID');
  return parsed.value;
}

function requireScope(workspaceId: string): TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
} {
  const parsed = parseTenantScopeV1({
    scopeType: 'project',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId,
    projectId: '00000000-0000-4000-8000-000000000003',
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_SCOPE_INVALID');
  assert.equal(parsed.value.scopeType, 'project');
  if (parsed.value.scopeType !== 'project') throw new Error('TEST_PROJECT_SCOPE_REQUIRED');
  return parsed.value;
}

const tenantScope = requireScope('00000000-0000-4000-8000-000000000002');
const otherTenantScope = requireScope('00000000-0000-4000-8000-000000000099');
const ids = Object.freeze({
  snapshot: requireId('00000000-0000-4000-8000-000000000301'),
  dashboardVersion: requireId('00000000-0000-4000-8000-000000000302'),
  materialization: requireId('00000000-0000-4000-8000-000000000303'),
  permissionProjection: requireId('00000000-0000-4000-8000-000000000304'),
  widget: requireId('00000000-0000-4000-8000-000000000305'),
  analysisPlan: requireId('00000000-0000-4000-8000-000000000306'),
  dataset: requireId('00000000-0000-4000-8000-000000000307'),
  semantic: requireId('00000000-0000-4000-8000-000000000308'),
  metric: requireId('00000000-0000-4000-8000-000000000309'),
  definition: requireId('00000000-0000-4000-8000-000000000310'),
  manifest: requireId('00000000-0000-4000-8000-000000000311'),
  effectivePolicy: requireId('00000000-0000-4000-8000-000000000312'),
});

function makeSnapshot(
  input: {
    readonly tenantScope?: TenantScopeV1;
    readonly audience?: 'OWNER' | 'PROJECT_VIEWERS';
  } = {},
): DashboardSnapshotV1 {
  const createdAt = parseStrictUtcTimestampV1('2026-08-13T08:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('TEST_TIMESTAMP_INVALID');
  const candidate = {
    snapshotId: ids.snapshot,
    tenantScope: input.tenantScope ?? tenantScope,
    dashboardVersionId: ids.dashboardVersion,
    materializationIds: [ids.materialization],
    inputSelectorHash: computeDashboardPublicationInputSelectorHashV1(ids.dashboardVersion, [
      ids.materialization,
    ]),
    permissionProjectionVersionId: ids.permissionProjection,
    audience: input.audience ?? ('PROJECT_VIEWERS' as const),
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAt.value,
  };
  const created = createDashboardSnapshotV1({
    ...candidate,
    canonicalHash: computeDashboardSnapshotHashV1(candidate),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_SNAPSHOT_INVALID');
  const materialization = {
    materializationId: ids.materialization,
    tenantScope: input.tenantScope ?? tenantScope,
    dashboardVersionId: ids.dashboardVersion,
    widgetId: ids.widget,
    analysisPlanVersionId: ids.analysisPlan,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    permissionProjectionVersionId: ids.permissionProjection,
    parameterHash: 'b'.repeat(64),
    locale: 'vi-VN',
    timezone: 'Asia/Bangkok',
    engineVersion: 'engine-v1',
    adapterVersion: 'adapter-v1',
    effectivePolicyVersionId: ids.effectivePolicy,
    resultManifestId: ids.manifest,
    createdAt: created.value.createdAt,
  } as const;
  const cacheKey = buildMaterializationCacheKeyV1(materialization);
  assert.equal(cacheKey.complete, true);
  if (!cacheKey.complete) throw new Error('TEST_CACHE_KEY_INVALID');
  const proof: DashboardPublicationMaterializationBindingProofV1 = {
    schemaVersion: 1,
    materializationId: materialization.materializationId,
    tenantScope: materialization.tenantScope,
    dashboardVersionId: materialization.dashboardVersionId,
    widgetId: materialization.widgetId,
    analysisPlanVersionId: materialization.analysisPlanVersionId,
    datasetVersionId: materialization.datasetVersionId,
    semanticVersionId: materialization.semanticVersionId,
    metricVersionId: materialization.metricVersionId,
    materializationDefinitionId: ids.definition,
    resultManifestId: materialization.resultManifestId,
    permissionProjectionVersionId: materialization.permissionProjectionVersionId,
    parameterHash: materialization.parameterHash,
    locale: materialization.locale,
    timezone: materialization.timezone,
    engineVersion: materialization.engineVersion,
    adapterVersion: materialization.adapterVersion,
    effectivePolicyVersionId: materialization.effectivePolicyVersionId,
    cacheIdentityHash: cacheKey.cacheIdentityHash,
    materializationCreatedAt: materialization.createdAt,
  };
  const canonicalHash = computeDashboardPublicationCanonicalHashV1({
    snapshot: created.value,
    bindingProof: [proof],
  });
  const withCanonicalHash = Object.freeze({ ...created.value, canonicalHash });
  return attachDashboardSnapshotBindingProofV1(withCanonicalHash, [proof]);
}

interface SnapshotHarnessV1 {
  readonly client: DdaRefreshDatabaseClientV1;
  readonly rows: Map<string, DashboardSnapshotRowV1>;
  readonly createCalls: () => number;
  readonly upsertCalls: () => number;
}

function toRow(data: DashboardSnapshotCreateV1): DashboardSnapshotRowV1 {
  return { ...data, createdAt: new Date(data.createdAt) };
}

function createSnapshotHarness(
  options: {
    readonly race?: 'EXACT' | 'DIFFERENT_CONTENT' | 'OTHER_TENANT';
  } = {},
): SnapshotHarnessV1 {
  const rows = new Map<string, DashboardSnapshotRowV1>();
  let createCalls = 0;
  let upsertCalls = 0;
  const snapshotDelegate = {
    create(input: { readonly data: DashboardSnapshotCreateV1 }) {
      createCalls += 1;
      let row = toRow(input.data);
      if (options.race !== undefined) {
        const envelope = input.data.materializationIds as Readonly<Record<string, unknown>>;
        row = {
          ...row,
          materializationIds: {
            inputSelectorHash: envelope['inputSelectorHash'],
            ids: envelope['ids'],
            version: envelope['version'],
            bindingProofVersion: envelope['bindingProofVersion'],
            bindingProof: envelope['bindingProof'],
          },
          ...(options.race === 'DIFFERENT_CONTENT' ? { audience: 'OWNER' } : {}),
          ...(options.race === 'OTHER_TENANT' ? { workspaceId: otherTenantScope.workspaceId } : {}),
        };
        rows.set(row.id, row);
        return Promise.reject(Object.assign(new Error('unique race'), { code: 'P2002' }));
      }
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardSnapshotCreateV1;
      readonly update: Omit<DashboardSnapshotCreateV1, 'id' | 'createdAt'>;
    }) {
      upsertCalls += 1;
      const existing = rows.get(input.where.id);
      const row =
        existing === undefined
          ? toRow(input.create)
          : ({ ...existing, ...input.update } as DashboardSnapshotRowV1);
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    findFirst(input: { readonly where: Readonly<Record<string, unknown>> }) {
      const row = rows.get(String(input.where['id']));
      if (row === undefined) return Promise.resolve(null);
      for (const key of ['organizationId', 'workspaceId', 'projectId'] as const) {
        const expected = input.where[key];
        if (expected !== undefined && row[key] !== expected) return Promise.resolve(null);
      }
      return Promise.resolve(row);
    },
  };
  return {
    client: { dashboardSnapshotRecord: snapshotDelegate } as unknown as DdaRefreshDatabaseClientV1,
    rows,
    createCalls: () => createCalls,
    upsertCalls: () => upsertCalls,
  };
}

void test('[DDA-031][DDA-032] immutable refresh snapshots accept exact replay but reject content and tenant mutation', async () => {
  const harness = createSnapshotHarness();
  const repository = new PrismaRefreshRepositoryAdapter(harness.client);
  const original = makeSnapshot();

  await repository.saveSnapshot(original);
  await repository.saveSnapshot(original);
  await assert.rejects(
    repository.saveSnapshot(makeSnapshot({ audience: 'OWNER' })),
    /DDA_IMMUTABLE_SNAPSHOT_CONFLICT/u,
  );
  await assert.rejects(
    repository.saveSnapshot(makeSnapshot({ tenantScope: otherTenantScope })),
    /DDA_IMMUTABLE_SNAPSHOT_CONFLICT/u,
  );

  assert.equal(harness.createCalls(), 1);
  assert.equal(harness.upsertCalls(), 0);
  assert.equal(harness.rows.get(original.snapshotId)?.workspaceId, tenantScope.workspaceId);
  assert.equal(harness.rows.get(original.snapshotId)?.audience, original.audience);
  assert.equal(harness.rows.get(original.snapshotId)?.bindingProofVersion, 1);
  assert.equal(
    (harness.rows.get(original.snapshotId)?.materializationIds as Record<string, unknown>)[
      'bindingProofVersion'
    ],
    1,
  );
});

void test('[DDA-032][DDA-034] refresh snapshot proof survives adapter restart and proofless durable rows are rejected', async () => {
  const harness = createSnapshotHarness();
  const original = makeSnapshot();
  await new PrismaRefreshRepositoryAdapter(harness.client).saveSnapshot(original);

  const restarted = new PrismaRefreshRepositoryAdapter(harness.client);
  const recovered = await restarted.findSnapshot(tenantScope, original.snapshotId);
  assert.deepEqual(recovered, original);
  assert.equal(
    (recovered as (DashboardSnapshotV1 & { readonly bindingProofVersion: number }) | undefined)
      ?.bindingProofVersion,
    1,
  );

  const row = harness.rows.get(original.snapshotId);
  assert.ok(row);
  Reflect.set(row, 'bindingProofVersion', 0);
  await assert.rejects(
    restarted.findSnapshot(tenantScope, original.snapshotId),
    /DDA_PERSISTED_SNAPSHOT_INVALID/u,
  );
});

void test('[DDA-032][DDA-034] in-memory refresh snapshot writers reject proofless snapshots', async () => {
  const proofful = makeSnapshot();
  const proofless = { ...proofful } as Record<string, unknown>;
  delete proofless['bindingProof'];
  delete proofless['bindingProofVersion'];

  await assert.rejects(
    new InMemoryRefreshRepositoryAdapter().saveSnapshot(proofless as never),
    /DDA_SNAPSHOT_BINDING_PROOF_REQUIRED/u,
  );
  await assert.rejects(
    new InMemoryRefreshCoordinatorAdapter().setCurrentSnapshot(
      tenantScope,
      '00000000-0000-4000-8000-000000000313',
      proofless as never,
    ),
    /DDA_SNAPSHOT_BINDING_PROOF_REQUIRED/u,
  );
});

void test('[DDA-031][DDA-032] a concurrent P2002 accepts only an exact immutable snapshot replay', async () => {
  const exact = createSnapshotHarness({ race: 'EXACT' });
  await new PrismaRefreshRepositoryAdapter(exact.client).saveSnapshot(makeSnapshot());
  assert.equal(exact.createCalls(), 1);
  assert.equal(exact.upsertCalls(), 0);

  for (const race of ['DIFFERENT_CONTENT', 'OTHER_TENANT'] as const) {
    const conflicting = createSnapshotHarness({ race });
    await assert.rejects(
      new PrismaRefreshRepositoryAdapter(conflicting.client).saveSnapshot(makeSnapshot()),
      /DDA_IMMUTABLE_SNAPSHOT_CONFLICT/u,
    );
    assert.equal(conflicting.createCalls(), 1);
    assert.equal(conflicting.upsertCalls(), 0);
  }
});

void test('[DDA-030] malformed durable refresh rows fail closed', async () => {
  const malformed: DashboardRefreshExecutionRowV1 = {
    id: '00000000-0000-4000-8000-000000000305',
    scopeType: 'project',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: tenantScope.projectId,
    dashboardId: '00000000-0000-4000-8000-000000000306',
    dashboardVersionId: '00000000-0000-4000-8000-000000000307',
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000308',
    datasetVersionId: '00000000-0000-4000-8000-000000000309',
    definitionIds: 'not-an-array',
    inputSelectorHash: 'a'.repeat(64),
    sourceEventIds: [],
    clientRequestIds: [],
    folderReplayKeys: [],
    state: 'NOT_A_REFRESH_STATE',
    revision: 1,
    openKey: null,
    leaseId: null,
    debounceWindowMs: 0,
    openedAtMs: 1,
    updatedAtMs: 1,
    updatedAt: new Date(),
  };
  const client = {
    dashboardRefreshExecutionRecord: {
      findFirst: () => Promise.resolve(malformed),
    },
  } as unknown as DdaRefreshDatabaseClientV1;
  await assert.rejects(
    new PrismaRefreshRepositoryAdapter(client).findRefresh(tenantScope, malformed.id),
    /DDA_PERSISTED_REFRESH_INVALID/u,
  );
});
