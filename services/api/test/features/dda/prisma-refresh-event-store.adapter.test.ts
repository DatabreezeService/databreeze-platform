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

import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';
import {
  attachDashboardSnapshotBindingProofV1,
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
} from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import { buildMaterializationCacheKeyV1 } from '../../../src/features/dda/refresh/application/materialization-cache-key.js';
import { PrismaRefreshEventStoreAdapter } from '../../../src/features/dda/refresh/adapter/prisma-refresh-event-store.adapter.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);
type ProjectScopeV1 = Extract<TenantScopeV1, { readonly scopeType: 'project' }>;
const projectScope = scope as ProjectScopeV1;

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_ID_INVALID');
  return parsed.value;
}

function snapshot(): DashboardSnapshotV1 {
  const createdAt = parseStrictUtcTimestampV1('2026-08-13T08:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('TEST_TIMESTAMP_INVALID');
  const input = {
    snapshotId: id('00000000-0000-4000-8000-000000000701'),
    tenantScope: scope,
    dashboardVersionId: id('00000000-0000-4000-8000-000000000702'),
    materializationIds: [id('00000000-0000-4000-8000-000000000703')],
    inputSelectorHash: computeDashboardPublicationInputSelectorHashV1(
      id('00000000-0000-4000-8000-000000000702'),
      [id('00000000-0000-4000-8000-000000000703')],
    ),
    permissionProjectionVersionId: id('00000000-0000-4000-8000-000000000704'),
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAt.value,
  };
  const created = createDashboardSnapshotV1({
    ...input,
    canonicalHash: computeDashboardSnapshotHashV1(input),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('TEST_SNAPSHOT_INVALID');
  const materialization = {
    materializationId: id('00000000-0000-4000-8000-000000000703'),
    tenantScope: scope,
    dashboardVersionId: input.dashboardVersionId,
    widgetId: id('00000000-0000-4000-8000-000000000707'),
    analysisPlanVersionId: id('00000000-0000-4000-8000-000000000708'),
    datasetVersionId: id('00000000-0000-4000-8000-000000000709'),
    semanticVersionId: id('00000000-0000-4000-8000-000000000710'),
    metricVersionId: id('00000000-0000-4000-8000-000000000711'),
    permissionProjectionVersionId: input.permissionProjectionVersionId,
    parameterHash: 'b'.repeat(64),
    locale: 'vi-VN',
    timezone: 'Asia/Bangkok',
    engineVersion: 'engine-v1',
    adapterVersion: 'adapter-v1',
    effectivePolicyVersionId: id('00000000-0000-4000-8000-000000000712'),
    resultManifestId: id('00000000-0000-4000-8000-000000000713'),
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
    materializationDefinitionId: id('00000000-0000-4000-8000-000000000714'),
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

function createClientHarness(): {
  readonly client: DdaDatabaseClientV1;
  readonly snapshots: unknown[];
  readonly states: unknown[];
  readonly events: Record<string, unknown>[];
} {
  const snapshots: unknown[] = [];
  const states: unknown[] = [];
  const events: Record<string, unknown>[] = [];
  const execution = {
    id: '00000000-0000-4000-8000-000000000706',
    scopeType: 'project',
    organizationId: projectScope.organizationId,
    workspaceId: projectScope.workspaceId,
    projectId: projectScope.projectId,
    dashboardId: '00000000-0000-4000-8000-000000000705',
    dashboardVersionId: '00000000-0000-4000-8000-000000000702',
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000704',
    inputSelectorHash: computeDashboardPublicationInputSelectorHashV1(
      id('00000000-0000-4000-8000-000000000702'),
      [id('00000000-0000-4000-8000-000000000703')],
    ),
    state: 'VERIFYING',
    revision: 1,
    leaseId: 'refresh-lease-1',
  } as Record<string, unknown>;
  let nextSequence = 1n;
  const client = {} as DdaDatabaseClientV1;
  Object.assign(client, {
    dashboardSnapshotRecord: {
      create({ data }: { readonly data: unknown }) {
        snapshots.push(data);
        return Promise.resolve(data);
      },
      findFirst({ where }: { readonly where: { readonly id: string } }) {
        const row = snapshots.find(
          (candidate) =>
            typeof candidate === 'object' &&
            candidate !== null &&
            (candidate as Record<string, unknown>)['id'] === where.id,
        );
        return Promise.resolve(row ?? null);
      },
    },
    dashboardRefreshStateRecord: {
      upsert({ create }: { readonly create: unknown }) {
        states.push(create);
        return Promise.resolve(Object.assign({}, create, { updatedAt: new Date() }));
      },
      findFirst({ where }: { readonly where: Record<string, unknown> }) {
        const row = [...states].reverse().find((candidate) => {
          if (candidate === null || typeof candidate !== 'object') return false;
          const record = candidate as Record<string, unknown>;
          return Object.entries(where).every(([key, value]) => record[key] === value);
        });
        return Promise.resolve(row ?? null);
      },
    },
    dashboardRefreshExecutionRecord: {
      findFirst({ where }: { readonly where: Record<string, unknown> }) {
        const matches = Object.entries(where).every(([key, value]) => execution[key] === value);
        return Promise.resolve(matches ? execution : null);
      },
      updateMany({
        where,
        data,
      }: {
        readonly where: Record<string, unknown>;
        readonly data: Record<string, unknown>;
      }) {
        const matches = Object.entries(where).every(([key, value]) => execution[key] === value);
        if (!matches) return Promise.resolve({ count: 0 });
        Object.assign(execution, data);
        return Promise.resolve({ count: 1 });
      },
    },
    dashboardRefreshEventSequenceRecord: {
      upsert() {
        const sequence = nextSequence;
        nextSequence += 1n;
        return Promise.resolve({ nextSequence: sequence + 1n });
      },
    },
    dashboardRefreshEventRecord: {
      create({ data }: { readonly data: Record<string, unknown> }) {
        const row = { ...data, createdAt: new Date() };
        events.push(row);
        return Promise.resolve(row);
      },
      findFirst({ where }: { readonly where: Record<string, unknown> }) {
        const row = events.find((candidate) =>
          Object.entries(where).every(([key, value]) => candidate[key] === value),
        );
        return Promise.resolve(row ?? null);
      },
      findMany: () => Promise.resolve([]),
    },
    $transaction: async <T>(callback: (transaction: DdaDatabaseClientV1) => Promise<T>) =>
      callback(client),
  });
  return { client, snapshots, states, events };
}

void test('[DDA-032][DDA-034] snapshot state and content-safe event commit share one transaction', async () => {
  const harness = createClientHarness();
  const store = new PrismaRefreshEventStoreAdapter(harness.client);
  const current = snapshot();

  const commit = {
    tenantScope: scope,
    dashboardId: id('00000000-0000-4000-8000-000000000705'),
    refreshId: id('00000000-0000-4000-8000-000000000706'),
    expectedRevision: 1,
    expectedLeaseId: 'refresh-lease-1',
    expectedInputSelectorHash: current.inputSelectorHash,
    snapshot: current,
    event: {
      tenantScope: scope,
      dashboardId: id('00000000-0000-4000-8000-000000000705'),
      snapshotId: current.snapshotId,
      freshnessState: 'FRESH',
      eventHash: current.canonicalHash,
      occurredAt: current.createdAt,
      eventKind: 'SNAPSHOT_COMMITTED',
      correlationId: id('00000000-0000-4000-8000-000000000706'),
      metadata: {
        refreshId: id('00000000-0000-4000-8000-000000000706'),
        dashboardVersionId: current.dashboardVersionId,
      },
    },
  } as const;
  await store.commitSnapshotAndEvent(commit);
  await store.commitSnapshotAndEvent(commit);

  assert.equal(harness.snapshots.length, 1);
  assert.equal((harness.snapshots[0] as Record<string, unknown>)['bindingProofVersion'], 1);
  assert.equal(
    (
      (harness.snapshots[0] as Record<string, unknown>)['materializationIds'] as Record<
        string,
        unknown
      >
    )['bindingProofVersion'],
    1,
  );
  assert.equal(harness.states.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0]!['sequence'], 1n);
  assert.deepEqual(harness.events[0]!['metadata'], {
    refreshId: '00000000-0000-4000-8000-000000000706',
    dashboardVersionId: '00000000-0000-4000-8000-000000000702',
  });
  assert.equal('cellValue' in harness.events[0]!, false);
  assert.equal('path' in harness.events[0]!, false);
});
