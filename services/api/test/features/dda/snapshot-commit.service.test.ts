import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { SnapshotCommitService } from '../../../src/features/dda/refresh/application/snapshot-commit.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

const ids = {
  dashboardId: id('00000000-0000-4000-8000-000000000201'),
  dashboardVersionId: id('00000000-0000-4000-8000-000000000202'),
  snapshotOld: id('00000000-0000-4000-8000-000000000203'),
  snapshotNew: id('00000000-0000-4000-8000-000000000204'),
  matA: id('00000000-0000-4000-8000-000000000205'),
  matB: id('00000000-0000-4000-8000-000000000206'),
  permission: id('00000000-0000-4000-8000-000000000207'),
  permissionAlt: id('00000000-0000-4000-8000-000000000208'),
};

function makeSnapshot(snapshotId: StableIdentifierV1, materializationIds: StableIdentifierV1[]) {
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) throw new Error('ts');
  const input = {
    snapshotId,
    tenantScope: scope,
    dashboardVersionId: ids.dashboardVersionId,
    materializationIds,
    inputSelectorHash: 'a'.repeat(64),
    permissionProjectionVersionId: ids.permission,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAtResult.value,
  };
  const canonicalHash = computeDashboardSnapshotHashV1(input);
  const created = createDashboardSnapshotV1({ ...input, canonicalHash });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('snapshot');
  return created.value;
}

void test('[DDA-032] atomic commit swaps pointer only after complete verification', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  const previous = makeSnapshot(ids.snapshotOld, [ids.matA]);
  await coordinator.setCurrentSnapshot(ids.dashboardId, previous);

  const service = new SnapshotCommitService(coordinator);
  const next = makeSnapshot(ids.snapshotNew, [ids.matA, ids.matB]);
  const committed = await service.commit({
    dashboardId: ids.dashboardId,
    refreshId: '00000000-0000-4000-8000-000000000211',
    snapshot: next,
    materializations: [
      {
        materializationId: ids.matA,
        resultManifestHash: 'b'.repeat(64),
        cacheIdentityHash: 'c'.repeat(64),
        datasetVersionId: '00000000-0000-4000-8000-000000000221',
        permissionProjectionVersionId: ids.permission,
        status: 'VERIFIED',
      },
      {
        materializationId: ids.matB,
        resultManifestHash: 'd'.repeat(64),
        cacheIdentityHash: 'e'.repeat(64),
        datasetVersionId: '00000000-0000-4000-8000-000000000221',
        permissionProjectionVersionId: ids.permission,
        status: 'VERIFIED',
      },
    ],
  });
  assert.equal(committed.accepted, true);
  if (!committed.accepted) return;
  assert.equal(committed.value.state, 'COMMITTED');
  assert.equal((await coordinator.getCurrentSnapshot(ids.dashboardId))?.snapshotId, ids.snapshotNew);
});

void test('[DDA-032] partial/mixed/failed results never replace the last complete snapshot', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  const previous = makeSnapshot(ids.snapshotOld, [ids.matA]);
  await coordinator.setCurrentSnapshot(ids.dashboardId, previous);
  const service = new SnapshotCommitService(coordinator);
  const next = makeSnapshot(ids.snapshotNew, [ids.matA, ids.matB]);

  const cases = [
    {
      name: 'missing manifest',
      materializations: [
        {
          materializationId: ids.matA,
          resultManifestHash: 'b'.repeat(64),
          cacheIdentityHash: 'c'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'VERIFIED' as const,
        },
        {
          materializationId: ids.matB,
          resultManifestHash: '',
          cacheIdentityHash: 'e'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'MISSING' as const,
        },
      ],
      code: 'INCOMPLETE_MATERIALIZATION_SET',
    },
    {
      name: 'mixed dataset versions',
      materializations: [
        {
          materializationId: ids.matA,
          resultManifestHash: 'b'.repeat(64),
          cacheIdentityHash: 'c'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'VERIFIED' as const,
        },
        {
          materializationId: ids.matB,
          resultManifestHash: 'd'.repeat(64),
          cacheIdentityHash: 'e'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000222',
          permissionProjectionVersionId: ids.permission,
          status: 'VERIFIED' as const,
        },
      ],
      code: 'MIXED_INPUT_SET',
    },
    {
      name: 'mixed permission projections',
      materializations: [
        {
          materializationId: ids.matA,
          resultManifestHash: 'b'.repeat(64),
          cacheIdentityHash: 'c'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'VERIFIED' as const,
        },
        {
          materializationId: ids.matB,
          resultManifestHash: 'd'.repeat(64),
          cacheIdentityHash: 'e'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permissionAlt,
          status: 'VERIFIED' as const,
        },
      ],
      code: 'MIXED_PERMISSION_PROJECTION',
    },
    {
      name: 'retention deleted',
      materializations: [
        {
          materializationId: ids.matA,
          resultManifestHash: 'b'.repeat(64),
          cacheIdentityHash: 'c'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'RETENTION_DELETED' as const,
        },
        {
          materializationId: ids.matB,
          resultManifestHash: 'd'.repeat(64),
          cacheIdentityHash: 'e'.repeat(64),
          datasetVersionId: '00000000-0000-4000-8000-000000000221',
          permissionProjectionVersionId: ids.permission,
          status: 'VERIFIED' as const,
        },
      ],
      code: 'SOURCE_UNAVAILABLE',
    },
  ];

  for (const [index, scenario] of cases.entries()) {
    const result = await service.commit({
      dashboardId: ids.dashboardId,
      refreshId: `00000000-0000-4000-8000-00000000030${index}`,
      snapshot: next,
      materializations: scenario.materializations,
    });
    assert.equal(result.accepted, false, scenario.name);
    if (result.accepted) continue;
    assert.equal(result.code, scenario.code, scenario.name);
    assert.equal(
      (await coordinator.getCurrentSnapshot(ids.dashboardId))?.snapshotId,
      ids.snapshotOld,
      scenario.name,
    );
  }
});

void test('[DDA-032] database commit failure retains previous snapshot pointer', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter({ failCommit: true });
  const previous = makeSnapshot(ids.snapshotOld, [ids.matA]);
  await coordinator.setCurrentSnapshot(ids.dashboardId, previous);
  const service = new SnapshotCommitService(coordinator);
  const next = makeSnapshot(ids.snapshotNew, [ids.matA]);
  const result = await service.commit({
    dashboardId: ids.dashboardId,
    refreshId: '00000000-0000-4000-8000-000000000311',
    snapshot: next,
    materializations: [
      {
        materializationId: ids.matA,
        resultManifestHash: 'b'.repeat(64),
        cacheIdentityHash: 'c'.repeat(64),
        datasetVersionId: '00000000-0000-4000-8000-000000000221',
        permissionProjectionVersionId: ids.permission,
        status: 'VERIFIED',
      },
    ],
  });
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'SNAPSHOT_COMMIT_FAILED');
  assert.equal((await coordinator.getCurrentSnapshot(ids.dashboardId))?.snapshotId, ids.snapshotOld);
});
