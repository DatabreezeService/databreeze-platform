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

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

function createSharedRefreshClient(): DdaRefreshDatabaseClientV1 {
  const states = new Map<string, DashboardRefreshStateRowV1>();
  const snapshots = new Map<string, DashboardSnapshotRowV1>();
  const executions = new Map<string, DashboardRefreshExecutionRowV1>();
  const idempotency = new Map<string, DashboardRefreshIdempotencyRowV1>();

  return {
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
      upsert(input) {
        const row: DashboardSnapshotRowV1 = {
          ...input.create,
          createdAt: new Date(input.create.createdAt),
        };
        snapshots.set(input.create.id, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        const row = snapshots.get(input.where.id);
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
    dashboardRefreshExecutionRecord: {
      upsert(input) {
        const row: DashboardRefreshExecutionRowV1 = {
          ...input.create,
          updatedAt: new Date(input.create.updatedAt),
        };
        executions.set(input.create.id, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        if ('id' in input.where && typeof input.where.id === 'string') {
          return Promise.resolve(executions.get(input.where.id) ?? null);
        }
        if ('openForDashboard' in input.where && input.where.openForDashboard !== undefined) {
          const open = input.where.openForDashboard;
          for (const row of executions.values()) {
            if (
              row.dashboardId === open.dashboardId &&
              (open.organizationId === undefined || row.organizationId === open.organizationId) &&
              (open.workspaceId === undefined || row.workspaceId === open.workspaceId) &&
              (open.projectId === undefined || row.projectId === open.projectId) &&
              (row.state === 'PENDING' || row.state === 'RUNNING' || row.state === 'VERIFYING')
            ) {
              return Promise.resolve(row);
            }
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
    },
    dashboardRefreshIdempotencyRecord: {
      upsert(input) {
        const key = `${input.create.keyKind}|${input.create.keyValue}`;
        idempotency.set(key, { ...input.create });
        return Promise.resolve(idempotency.get(key)!);
      },
      findFirst(input) {
        const key = `${input.where.keyKind}|${input.where.keyValue}`;
        const row = idempotency.get(key);
        if (!row) return Promise.resolve(null);
        if (
          input.where.organizationId !== undefined &&
          row.organizationId !== input.where.organizationId
        ) {
          return Promise.resolve(null);
        }
        if (input.where.workspaceId !== undefined && row.workspaceId !== input.where.workspaceId) {
          return Promise.resolve(null);
        }
        if (input.where.projectId !== undefined && row.projectId !== input.where.projectId) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      },
    },
  };
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
    debounceWindowMs: 1000,
    openedAtMs: 1,
    updatedAtMs: 1,
  });
  await first.setCurrentSnapshot(dashboardId, snapshot.value);

  const open = await second.findOpenRefresh(dashboardId);
  assert.equal(open?.refreshId, refreshId);
  assert.equal(open?.state, 'PENDING');

  const bySource = await second.findByIdempotency({ sourceEventId });
  assert.equal(bySource?.refreshId, refreshId);

  const current = await second.getCurrentSnapshot(dashboardId);
  assert.equal(current?.snapshotId, snapshotId);
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
