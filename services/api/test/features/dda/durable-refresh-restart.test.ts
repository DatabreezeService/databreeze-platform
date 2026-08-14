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

import {
  PrismaRefreshRepositoryAdapter,
  type DdaRefreshDatabaseClientV1,
  type DashboardRefreshExecutionRowV1,
  type DashboardRefreshIdempotencyRowV1,
  type DashboardRefreshStateRowV1,
  type DashboardSnapshotRowV1,
} from '../../../src/features/dda/adapter/prisma-refresh-repository.adapter.js';
import { PrismaDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/prisma-dashboard-draft-repository.adapter.js';
import { PrismaEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/prisma-etl-proposal-repository.adapter.js';
import { DurableRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/durable-refresh-coordinator.adapter.js';
import { withRefreshSnapshotBindingProof } from './refresh-snapshot-fixture.js';
import { RefreshOrchestratorService } from '../../../src/features/dda/refresh/application/refresh-orchestrator.service.js';
import { SnapshotCommitService } from '../../../src/features/dda/refresh/application/snapshot-commit.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000101',
  workspaceId: '00000000-0000-4000-8000-000000000102',
  projectId: '00000000-0000-4000-8000-000000000103',
});
assert.equal(otherScopeResult.accepted, true);
const otherTenantScope = otherScopeResult.accepted ? otherScopeResult.value : (null as never);

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

function createSharedRefreshClient(
  options: { readonly failFirstTransaction?: boolean } = {},
): DdaRefreshDatabaseClientV1 {
  const states = new Map<string, DashboardRefreshStateRowV1>();
  const snapshots = new Map<string, DashboardSnapshotRowV1>();
  const executions = new Map<string, DashboardRefreshExecutionRowV1>();
  const idempotency = new Map<string, DashboardRefreshIdempotencyRowV1>();
  let transactionChain = Promise.resolve();
  let failFirstTransaction = options.failFirstTransaction === true;

  const value: DdaRefreshDatabaseClientV1 = {
    dashboardRefreshStateRecord: {
      upsert(input) {
        const key = `${input.create.organizationId}|${input.create.workspaceId}|${input.create.projectId}|${input.create.dashboardId}`;
        const row: DashboardRefreshStateRowV1 = {
          ...input.create,
          updatedAt: new Date('2026-08-11T00:00:00.000Z'),
        };
        states.set(key, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        const key = `${input.where.organizationId}|${input.where.workspaceId}|${input.where.projectId}|${input.where.dashboardId}`;
        return Promise.resolve(states.get(key) ?? null);
      },
    },
    dashboardSnapshotRecord: {
      create(input) {
        const row: DashboardSnapshotRowV1 = {
          ...input.data,
          createdAt: new Date(input.data.createdAt),
        };
        snapshots.set(input.data.id, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        const row = snapshots.get(input.where.id);
        if (!row) return Promise.resolve(null);
        if (
          ('organizationId' in input.where && row.organizationId !== input.where.organizationId) ||
          ('workspaceId' in input.where && row.workspaceId !== input.where.workspaceId) ||
          ('projectId' in input.where && row.projectId !== input.where.projectId)
        ) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      },
    },
    dashboardRefreshExecutionRecord: {
      create(input) {
        const row: DashboardRefreshExecutionRowV1 = {
          ...input.data,
          updatedAt: new Date(input.data.updatedAt),
        };
        if (executions.has(row.id)) {
          return Promise.reject(Object.assign(new Error('duplicate'), { code: 'P2002' }));
        }
        executions.set(row.id, row);
        return Promise.resolve(row);
      },
      upsert(input) {
        const row: DashboardRefreshExecutionRowV1 = {
          ...input.create,
          updatedAt: new Date(input.create.updatedAt),
        };
        executions.set(input.create.id, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        const where = input.where;
        if (typeof where['id'] === 'string') {
          const row = executions.get(where['id']);
          if (!row) return Promise.resolve(null);
          if (
            (typeof where['organizationId'] === 'string' &&
              row.organizationId !== where['organizationId']) ||
            (typeof where['workspaceId'] === 'string' &&
              row.workspaceId !== where['workspaceId']) ||
            (typeof where['projectId'] === 'string' && row.projectId !== where['projectId'])
          )
            return Promise.resolve(null);
          return Promise.resolve(row);
        }
        for (const row of executions.values()) {
          const state = where['state'];
          const stateMatches =
            state === undefined ||
            (typeof state === 'object' &&
              state !== null &&
              Array.isArray((state as Record<string, unknown>)['in']) &&
              ((state as Record<string, unknown>)['in'] as unknown[]).includes(row.state)) ||
            state === row.state;
          if (
            row.dashboardId === where['dashboardId'] &&
            row.organizationId === where['organizationId'] &&
            row.workspaceId === where['workspaceId'] &&
            row.projectId === where['projectId'] &&
            stateMatches
          ) {
            return Promise.resolve(row);
          }
        }
        return Promise.resolve(null);
      },
      updateMany(input) {
        const row = executions.get(String(input.where['id']));
        if (!row) return Promise.resolve({ count: 0 });
        const matches = Object.entries(input.where).every(([key, expected]) => {
          if (key === 'state' && typeof expected === 'object' && expected !== null) {
            const values = (expected as Record<string, unknown>)['in'];
            return Array.isArray(values) && values.includes(row.state);
          }
          return (row as unknown as Record<string, unknown>)[key] === expected;
        });
        if (!matches) return Promise.resolve({ count: 0 });
        const revisionUpdate = input.data['revision'];
        const nextRevision =
          revisionUpdate !== null &&
          typeof revisionUpdate === 'object' &&
          typeof (revisionUpdate as Record<string, unknown>)['increment'] === 'number'
            ? row.revision + Number((revisionUpdate as Record<string, unknown>)['increment'])
            : typeof revisionUpdate === 'number'
              ? revisionUpdate
              : row.revision;
        const updated = {
          ...row,
          ...input.data,
          revision: nextRevision,
          updatedAt:
            input.data['updatedAt'] instanceof Date ? input.data['updatedAt'] : row.updatedAt,
        } as DashboardRefreshExecutionRowV1;
        executions.set(row.id, updated);
        return Promise.resolve({ count: 1 });
      },
    },
    dashboardRefreshIdempotencyRecord: {
      create(input) {
        const key = `${input.data.scopeType}|${input.data.organizationId}|${input.data.workspaceId}|${input.data.projectId}|${input.data.keyKind}|${input.data.keyValue}`;
        if (idempotency.has(key)) {
          return Promise.reject(Object.assign(new Error('duplicate'), { code: 'P2002' }));
        }
        idempotency.set(key, { ...input.data });
        return Promise.resolve(idempotency.get(key)!);
      },
      findFirst(input) {
        const key = `${String(input.where['scopeType'])}|${String(input.where['organizationId'])}|${String(input.where['workspaceId'])}|${String(input.where['projectId'])}|${String(input.where['keyKind'])}|${String(input.where['keyValue'])}`;
        const row = idempotency.get(key);
        if (!row) return Promise.resolve(null);
        return Promise.resolve(row);
      },
    },
    $transaction: async <T>(callback: (transaction: DdaRefreshDatabaseClientV1) => Promise<T>) => {
      const next = transactionChain.then(() => {
        if (failFirstTransaction) {
          failFirstTransaction = false;
          throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
        }
        return callback(value);
      });
      transactionChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
  return value;
}

void test('[DDA-036] second process finds open refresh, snapshot, and source-event idempotency after restart', async () => {
  const shared = createSharedRefreshClient();
  const first = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));
  const second = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));

  const dashboardId = id('00000000-0000-4000-8000-00000000001b');
  const refreshId = '00000000-0000-4000-8000-000000000060';
  const snapshotId = id('00000000-0000-4000-8000-000000000061');
  const materializationId = id('00000000-0000-4000-8000-000000000062');
  const permissionProjectionVersionId = id('00000000-0000-4000-8000-000000000063');
  const dashboardVersionId = id('00000000-0000-4000-8000-000000000011');
  const sourceEventId = '00000000-0000-4000-8000-000000000070';
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-11T01:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) return;

  const snapshotInput = {
    snapshotId,
    tenantScope,
    dashboardVersionId,
    materializationIds: [materializationId],
    inputSelectorHash: 'b'.repeat(64),
    permissionProjectionVersionId,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAtResult.value,
  };
  const snapshot = createDashboardSnapshotV1({
    ...snapshotInput,
    canonicalHash: computeDashboardSnapshotHashV1(snapshotInput),
  });
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) return;
  const snapshotWithProof = withRefreshSnapshotBindingProof(snapshot.value);

  await first.saveRefresh({
    refreshId,
    tenantScope,
    dashboardId,
    dashboardVersionId,
    permissionProjectionVersionId,
    datasetVersionId: '00000000-0000-4000-8000-000000000018',
    definitionIds: ['00000000-0000-4000-8000-000000000080'],
    inputSelectorHash: 'b'.repeat(64),
    sourceEventIds: [sourceEventId],
    clientRequestIds: ['client-1'],
    folderReplayKeys: ['folder-1'],
    state: 'PENDING',
    revision: 1,
    debounceWindowMs: 1000,
    openedAtMs: 1,
    updatedAtMs: 1,
  });
  await first.setCurrentSnapshot(tenantScope, dashboardId, snapshotWithProof);

  const open = await second.findOpenRefresh(tenantScope, dashboardId);
  assert.equal(open?.refreshId, refreshId);
  assert.equal(open?.state, 'PENDING');

  const bySource = await second.findByIdempotency({ tenantScope, sourceEventId });
  assert.equal(bySource?.refreshId, refreshId);

  const current = await second.getCurrentSnapshot(tenantScope, dashboardId);
  assert.equal(current?.snapshotId, snapshotId);
});

void test('[DDA-036] durable idempotency ownership includes the exact tenant scope', async () => {
  const shared = createSharedRefreshClient();
  const first = new PrismaRefreshRepositoryAdapter(shared);
  const dashboardId = id('00000000-0000-4000-8000-00000000001d');
  const base = {
    dashboardId,
    dashboardVersionId: id('00000000-0000-4000-8000-00000000001e'),
    permissionProjectionVersionId: id('00000000-0000-4000-8000-00000000001f'),
    datasetVersionId: '00000000-0000-4000-8000-000000000020',
    definitionIds: [],
    inputSelectorHash: 'd'.repeat(64),
    sourceEventIds: ['00000000-0000-4000-8000-000000000021'],
    clientRequestIds: ['client-scoped'],
    folderReplayKeys: ['folder-scoped'],
    state: 'PENDING' as const,
    revision: 1,
    debounceWindowMs: 1000,
    openedAtMs: 1,
    updatedAtMs: 1,
  };
  await first.saveRefresh({
    ...base,
    refreshId: '00000000-0000-4000-8000-000000000022',
    tenantScope,
  });
  await first.saveRefresh({
    ...base,
    refreshId: '00000000-0000-4000-8000-000000000023',
    tenantScope: otherTenantScope,
  });
  await assert.rejects(
    first.saveRefresh({
      ...base,
      refreshId: '00000000-0000-4000-8000-000000000024',
      tenantScope,
    }),
    /DDA_REFRESH_IDEMPOTENCY_CONFLICT/u,
  );
  const sourceEventId = base.sourceEventIds[0]!;
  const primary = await first.findByIdempotency({
    tenantScope,
    sourceEventId,
  });
  const other = await first.findByIdempotency({
    tenantScope: otherTenantScope,
    sourceEventId,
  });
  assert.equal(primary?.refreshId, '00000000-0000-4000-8000-000000000022');
  assert.equal(other?.refreshId, '00000000-0000-4000-8000-000000000023');
});

void test('[DDA-036] two durable coordinators reserve one open refresh transactionally', async () => {
  const shared = createSharedRefreshClient();
  const first = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));
  const second = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));
  const firstOrchestrator = new RefreshOrchestratorService(first, new SnapshotCommitService(first));
  const secondOrchestrator = new RefreshOrchestratorService(
    second,
    new SnapshotCommitService(second),
  );
  const base = {
    tenantScope,
    dashboardId: id('00000000-0000-4000-8000-000000000024'),
    dashboardVersionId: id('00000000-0000-4000-8000-000000000025'),
    permissionProjectionVersionId: id('00000000-0000-4000-8000-000000000026'),
    datasetVersionId: id('00000000-0000-4000-8000-000000000027'),
    definitionIds: [id('00000000-0000-4000-8000-000000000028')],
    inputSelectorHash: 'e'.repeat(64),
    debounceWindowMs: 1000,
    occurredAtMs: 1,
  };
  const [left, right] = await Promise.all([
    firstOrchestrator.acceptTrigger({
      ...base,
      sourceEventId: '00000000-0000-4000-8000-000000000029',
      clientRequestId: 'client-029',
      folderReplayKey: 'folder-029',
    }),
    secondOrchestrator.acceptTrigger({
      ...base,
      sourceEventId: '00000000-0000-4000-8000-000000000030',
      clientRequestId: 'client-030',
      folderReplayKey: 'folder-030',
      occurredAtMs: 2,
    }),
  ]);
  assert.equal(left.accepted, true);
  assert.equal(right.accepted, true);
  if (!left.accepted || !right.accepted) return;
  assert.equal(left.value.refreshId, right.value.refreshId);
  assert.equal(right.value.coalesced, true);
  const retry = await secondOrchestrator.acceptTrigger({
    ...base,
    sourceEventId: '00000000-0000-4000-8000-000000000029',
    clientRequestId: 'client-029',
    folderReplayKey: 'folder-029',
  });
  assert.equal(retry.accepted, true);
  if (retry.accepted) {
    assert.equal(retry.value.refreshId, left.value.refreshId);
    assert.equal(retry.value.idempotentReplay, true);
  }
});

void test('[DDA-036] a transaction outage before reservation is retried without a partial owner', async () => {
  const shared = createSharedRefreshClient({ failFirstTransaction: true });
  const coordinator = new DurableRefreshCoordinatorAdapter(
    new PrismaRefreshRepositoryAdapter(shared),
  );
  const orchestrator = new RefreshOrchestratorService(
    coordinator,
    new SnapshotCommitService(coordinator),
  );
  const input = {
    tenantScope,
    dashboardId: id('00000000-0000-4000-8000-000000000035'),
    dashboardVersionId: id('00000000-0000-4000-8000-000000000036'),
    permissionProjectionVersionId: id('00000000-0000-4000-8000-000000000037'),
    datasetVersionId: id('00000000-0000-4000-8000-000000000038'),
    definitionIds: [],
    inputSelectorHash: '1'.repeat(64),
    debounceWindowMs: 1000,
    occurredAtMs: 1,
    sourceEventId: '00000000-0000-4000-8000-000000000039',
    clientRequestId: 'client-039',
    folderReplayKey: 'folder-039',
  };
  const accepted = await orchestrator.acceptTrigger(input);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const replay = await orchestrator.acceptTrigger(input);
  assert.equal(replay.accepted, true);
  if (replay.accepted) {
    assert.equal(replay.value.refreshId, accepted.value.refreshId);
    assert.equal(replay.value.idempotentReplay, true);
  }
});

void test('[DDA-036] a stale lifecycle transition cannot overwrite a committed refresh', async () => {
  const shared = createSharedRefreshClient();
  const writer = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));
  const stale = new DurableRefreshCoordinatorAdapter(new PrismaRefreshRepositoryAdapter(shared));
  const dashboardId = id('00000000-0000-4000-8000-00000000003a');
  const refreshId = id('00000000-0000-4000-8000-00000000003b');
  const dashboardVersionId = id('00000000-0000-4000-8000-00000000003c');
  const permissionProjectionVersionId = id('00000000-0000-4000-8000-00000000003d');
  const snapshotId = id('00000000-0000-4000-8000-00000000003e');
  const materializationId = id('00000000-0000-4000-8000-00000000003f');
  const timestamp = parseStrictUtcTimestampV1('2026-08-12T10:00:00.000Z');
  assert.equal(timestamp.accepted, true);
  if (!timestamp.accepted) return;
  const snapshotInput = {
    snapshotId,
    tenantScope,
    dashboardVersionId,
    materializationIds: [materializationId],
    inputSelectorHash: '2'.repeat(64),
    permissionProjectionVersionId,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: timestamp.value,
  };
  const snapshot = createDashboardSnapshotV1({
    ...snapshotInput,
    canonicalHash: computeDashboardSnapshotHashV1(snapshotInput),
  });
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) return;
  const snapshotWithProof = withRefreshSnapshotBindingProof(snapshot.value);

  await writer.saveRefresh({
    refreshId,
    tenantScope,
    dashboardId,
    dashboardVersionId,
    permissionProjectionVersionId,
    datasetVersionId: id('00000000-0000-4000-8000-000000000040'),
    definitionIds: [],
    inputSelectorHash: snapshotWithProof.inputSelectorHash,
    sourceEventIds: [],
    clientRequestIds: [],
    folderReplayKeys: [],
    state: 'VERIFYING',
    revision: 1,
    leaseId: 'lease-race',
    debounceWindowMs: 0,
    openedAtMs: 10,
    updatedAtMs: 10,
  });
  const staleRecord = await stale.findRefresh(tenantScope, refreshId);
  assert.equal(staleRecord?.revision, 1);

  await writer.commitSnapshotAtomically({
    tenantScope,
    dashboardId,
    refreshId,
    expectedRevision: 1,
    expectedLeaseId: 'lease-race',
    expectedInputSelectorHash: snapshotWithProof.inputSelectorHash,
    snapshot: snapshotWithProof,
  });

  if (staleRecord === undefined) return;
  await assert.rejects(
    stale.saveRefresh({
      ...staleRecord,
      state: 'RUNNING',
      revision: 2,
      leaseId: 'stale-lease',
    }),
    /DDA_REFRESH_TRANSITION_REQUIRED/u,
  );
  await assert.rejects(
    stale.transitionRefresh({
      tenantScope,
      refreshId,
      dashboardId,
      expectedRevision: 1,
      expectedState: 'VERIFYING',
      expectedLeaseId: 'lease-race',
      nextState: 'RUNNING',
      nextLeaseId: 'stale-lease',
      updatedAtMs: 11,
    }),
    /DDA_REFRESH_TRANSITION_STALE/u,
  );
  const committed = await writer.findRefresh(tenantScope, refreshId);
  assert.equal(committed?.state, 'COMMITTED');
  assert.equal(committed?.revision, 2);
});

void test('[DDA-036] second process finds durable ETL proposal and dashboard draft identity', async () => {
  const identities = new Map<string, Record<string, unknown>>();
  const sharedDrafts = {
    dashboardRecord: {
      upsert(input: { create: Record<string, unknown> }) {
        identities.set(String(input.create['id']), {
          ...input.create,
          createdAt: new Date('2026-08-11T00:00:00.000Z'),
          updatedAt: new Date('2026-08-11T00:00:00.000Z'),
        });
        return Promise.resolve(identities.get(String(input.create['id']))!);
      },
      findFirst(input: {
        where: {
          id: string;
          organizationId: string;
          workspaceId: string;
          projectId: string;
        };
      }) {
        const row = identities.get(input.where.id) as
          | {
              organizationId: string;
              workspaceId: string;
              projectId: string;
            }
          | undefined;
        if (!row) return Promise.resolve(null);
        if (
          row.organizationId !== input.where.organizationId ||
          row.workspaceId !== input.where.workspaceId ||
          row.projectId !== input.where.projectId
        ) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      },
    },
    dashboardVersionRecord: {
      upsert(input: { create: Record<string, unknown> }) {
        return Promise.resolve(input.create);
      },
      findFirst() {
        return Promise.resolve(null);
      },
    },
    dashboardRemovedWidgetRecord: {
      upsert(input: { create: Record<string, unknown> }) {
        return Promise.resolve(input.create);
      },
      findFirst() {
        return Promise.resolve(null);
      },
    },
  };

  const firstDrafts = new PrismaDashboardDraftRepositoryAdapter(sharedDrafts as never);
  const secondDrafts = new PrismaDashboardDraftRepositoryAdapter(sharedDrafts as never);
  const dashboardId = '00000000-0000-4000-8000-00000000001b';
  await firstDrafts.saveIdentity({
    dashboardId,
    tenantScope,
    title: { vi: 'Bảng', en: 'Board' },
    status: 'DRAFT',
    revision: 1,
  });
  const found = await secondDrafts.findIdentity(tenantScope, dashboardId);
  assert.equal(found?.dashboardId, dashboardId);
  assert.equal(found?.title.en, 'Board');

  const proposalRows = new Map<string, Record<string, unknown>>();
  const sharedProposals = {
    etlProposalRecord: {
      upsert(input: { create: Record<string, unknown> }) {
        proposalRows.set(String(input.create['id']), {
          ...input.create,
          createdAt: new Date(String(input.create['createdAt'])),
          updatedAt: new Date('2026-08-11T00:00:00.000Z'),
        });
        return Promise.resolve(proposalRows.get(String(input.create['id']))!);
      },
      findFirst(input: { where: { id: string } }) {
        return Promise.resolve(proposalRows.get(input.where.id) ?? null);
      },
    },
  };
  const firstProposals = new PrismaEtlProposalRepositoryAdapter(sharedProposals as never);
  const secondProposals = new PrismaEtlProposalRepositoryAdapter(sharedProposals as never);
  const proposalId = '00000000-0000-4000-8000-000000000090';
  await firstProposals.save({
    proposalId,
    revision: 1,
    state: 'NEEDS_REVIEW',
    blockingReasons: [],
    plan: { version: 1 },
    review: {
      sourceSchema: ['a'],
      inferredSchema: ['a'],
      targetSchema: ['a'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 1, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'UNAVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
    },
    createdAt: '2026-08-11T01:00:00.000Z',
    tenantScope,
  });
  const proposal = await secondProposals.findById(proposalId);
  assert.equal(proposal?.proposalId, proposalId);
  assert.equal(proposal?.state, 'NEEDS_REVIEW');
});
