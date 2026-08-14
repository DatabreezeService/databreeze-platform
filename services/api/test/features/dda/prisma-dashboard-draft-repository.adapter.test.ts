/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createDdaMaterializationV1,
  createDashboardVersionV1,
  type DdaMaterializationV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDashboardDraftRepositoryAdapter,
  type DdaDashboardDraftDatabaseClientV1,
} from '../../../src/features/dda/dashboard/adapter/prisma-dashboard-draft-repository.adapter.js';
import type { DashboardPublicationReplayPreflightResultV1 } from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import { buildMaterializationCacheKeyV1 } from '../../../src/features/dda/refresh/application/materialization-cache-key.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
type ProjectScopeV1 = Extract<TenantScopeV1, { readonly scopeType: 'project' }>;
const scope = (scopeResult.accepted ? scopeResult.value : (null as never)) as ProjectScopeV1;

const ids = Object.freeze({
  dashboard: '00000000-0000-4000-8000-00000000001b',
  version: '00000000-0000-4000-8000-000000000011',
  page: '00000000-0000-4000-8000-00000000001c',
  widget: '00000000-0000-4000-8000-00000000001d',
  plan: '00000000-0000-4000-8000-000000000010',
  materialization: '00000000-0000-4000-8000-00000000001f',
  dataset: '00000000-0000-4000-8000-000000000018',
  semantic: '00000000-0000-4000-8000-000000000019',
  metric: '00000000-0000-4000-8000-00000000001a',
});

function version() {
  const created = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope: scope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh thu', en: 'Sales' },
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
        title: { vi: 'Tong doanh thu', en: 'Total sales' },
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
    timezone: 'Asia/Ho_Chi_Minh',
    freshnessPolicy: 'ON_CHANGE',
    publicationPolicy: 'REVIEWED',
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-08-12T02:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid version fixture');
  return created.value;
}

function memoryClient(): {
  readonly client: DdaDashboardDraftDatabaseClientV1;
  readonly calls: { create: number; upsert: number };
  readonly rows: Map<string, Record<string, unknown>>;
} {
  const rows = new Map<string, Record<string, unknown>>();
  const calls = { create: 0, upsert: 0 };
  const client = {
    dashboardVersionRecord: {
      create(input: { readonly data: Record<string, unknown> }) {
        calls.create += 1;
        const id = String(input.data['id']);
        if (rows.has(id)) return Promise.reject(new Error('DUPLICATE_DASHBOARD_VERSION_ID'));
        rows.set(id, { ...input.data });
        return Promise.resolve(rows.get(id)!);
      },
      upsert(input: { readonly create: Record<string, unknown> }) {
        calls.upsert += 1;
        rows.set(String(input.create['id']), { ...input.create });
        return Promise.resolve(rows.get(String(input.create['id']))!);
      },
      findFirst(input: { readonly where: { readonly id: string } }) {
        const row = rows.get(input.where.id);
        if (!row) return Promise.resolve(null);
        return Promise.resolve({
          ...row,
          layoutGraph: row['layoutGraph'],
        });
      },
    },
  } as unknown as DdaDashboardDraftDatabaseClientV1;
  return { client, calls, rows };
}

type PublicationCommitInputV1 = {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  readonly resolvedProjection: {
    readonly materializations: readonly DdaMaterializationV1[];
    readonly bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[];
    readonly freshnessState: 'FRESH' | 'STALE';
    readonly evidenceState: 'AVAILABLE' | 'PARTIAL';
  };
  readonly auditMetadata: {
    readonly actorId: string;
    readonly correlationId: string;
    readonly authorizationEpoch: number;
  };
  readonly approvalInvalidation?: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly priorPublishedVersionId: string;
  };
};

function materialization(): DdaMaterializationV1 {
  const cacheKey = buildMaterializationCacheKeyV1({
    tenantScope: scope,
    dashboardVersionId: ids.version,
    widgetId: ids.widget,
    analysisPlanVersionId: ids.plan,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
    parameterHash: 'b'.repeat(64),
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-1',
    adapterVersion: 'adapter-1',
    effectivePolicyVersionId: '00000000-0000-4000-8000-000000000022',
  });
  assert.equal(cacheKey.complete, true);
  if (!cacheKey.complete) throw new Error('invalid cache key fixture');
  const created = createDdaMaterializationV1({
    materializationId: ids.materialization,
    tenantScope: scope,
    dashboardVersionId: ids.version,
    widgetId: ids.widget,
    analysisPlanVersionId: ids.plan,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
    parameterHash: 'b'.repeat(64),
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-1',
    adapterVersion: 'adapter-1',
    effectivePolicyVersionId: '00000000-0000-4000-8000-000000000022',
    resultManifestId: '00000000-0000-4000-8000-000000000023',
    cacheIdentityHash: cacheKey.cacheIdentityHash,
    createdAt: '2026-08-12T02:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid materialization fixture');
  return created.value;
}

function bindingProof(): readonly DashboardPublicationMaterializationBindingProofV1[] {
  const row = materialization();
  return [
    {
      schemaVersion: row.schemaVersion,
      materializationId: ids.materialization as never,
      tenantScope: row.tenantScope,
      dashboardVersionId: row.dashboardVersionId,
      widgetId: ids.widget as never,
      analysisPlanVersionId: row.analysisPlanVersionId,
      datasetVersionId: row.datasetVersionId,
      semanticVersionId: row.semanticVersionId,
      metricVersionId: row.metricVersionId,
      materializationDefinitionId: ids.materialization as never,
      resultManifestId: row.resultManifestId,
      permissionProjectionVersionId: row.permissionProjectionVersionId,
      parameterHash: row.parameterHash,
      locale: row.locale,
      timezone: row.timezone,
      engineVersion: row.engineVersion,
      adapterVersion: row.adapterVersion,
      effectivePolicyVersionId: row.effectivePolicyVersionId,
      cacheIdentityHash: row.cacheIdentityHash,
      materializationCreatedAt: row.createdAt,
    },
  ];
}

type PublicationCommitRepositoryV1 = {
  findPublicationReplay(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  }): Promise<DashboardPublicationReplayPreflightResultV1>;
  commitPublication(input: PublicationCommitInputV1): Promise<
    | {
        readonly accepted: true;
        readonly snapshot: Record<string, unknown>;
        readonly replayed: boolean;
      }
    | { readonly accepted: false; readonly code: string }
  >;
};

function publicationClient(
  options: {
    readonly failAfterSnapshot?: boolean;
    readonly failAtAudit?: boolean;
    readonly failAtInvalidation?: boolean;
  } = {},
) {
  const identityRows = new Map<string, Record<string, unknown>>([
    [
      ids.dashboard,
      {
        id: ids.dashboard,
        scopeType: 'project',
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        titleVi: 'Bang',
        titleEn: 'Dashboard',
        status: 'DRAFT',
        draftVersionId: ids.version,
        publishedVersionId: null,
        revision: 1,
        createdAt: new Date('2026-08-12T02:00:00.000Z'),
        updatedAt: new Date('2026-08-12T02:00:00.000Z'),
      },
    ],
  ]);
  const versionRows = new Map<string, Record<string, unknown>>([
    [
      ids.version,
      {
        id: ids.version,
        ...version(),
        scopeType: 'project',
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        layoutGraph: version(),
      },
    ],
  ]);
  const snapshotRows = new Map<string, Record<string, unknown>>();
  const idempotencyRows = new Map<string, Record<string, unknown>>();
  const refreshRows = new Map<string, Record<string, unknown>>();
  const outboxRows = new Map<string, Record<string, unknown>>();
  const invalidationRows = new Map<string, Record<string, unknown>>();
  const calls = {
    snapshotCreate: 0,
    snapshotUpdate: 0,
    snapshotUpsert: 0,
    idempotencyCreate: 0,
    dashboardUpdate: 0,
    refreshUpsert: 0,
    auditCreate: 0,
    invalidationCreate: 0,
    transactions: 0,
    events: [] as string[],
  };

  const inScope = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    row['organizationId'] === where['organizationId'] &&
    row['workspaceId'] === where['workspaceId'] &&
    row['projectId'] === where['projectId'];
  const idempotencyKey = (where: Record<string, unknown>) =>
    `${String(where['organizationId'])}|${String(where['workspaceId'])}|${String(where['projectId'])}|${String(where['keyValue'])}`;

  const client = {
    dashboardRecord: {
      findFirst: async (input: { readonly where: Record<string, unknown> }) => {
        const row = identityRows.get(String(input.where['id']));
        return row && inScope(row, input.where) ? row : null;
      },
      updateMany: async (input: {
        readonly where: Record<string, unknown>;
        readonly data: Record<string, unknown>;
      }) => {
        const row = identityRows.get(String(input.where['id']));
        if (!row || !inScope(row, input.where) || row['revision'] !== input.where['revision']) {
          return { count: 0 };
        }
        Object.assign(row, input.data);
        calls.dashboardUpdate += 1;
        calls.events.push('dashboard-update');
        return { count: 1 };
      },
    },
    dashboardVersionRecord: {
      findFirst: async (input: { readonly where: Record<string, unknown> }) => {
        const row = versionRows.get(String(input.where['id']));
        return row && inScope(row, input.where) ? row : null;
      },
    },
    dashboardSnapshotRecord: {
      create: async (input: { readonly data: Record<string, unknown> }) => {
        calls.snapshotCreate += 1;
        const id = String(input.data['id']);
        if (snapshotRows.has(id)) throw new Error('DUPLICATE_DASHBOARD_SNAPSHOT_ID');
        snapshotRows.set(id, structuredClone(input.data));
        return snapshotRows.get(id)!;
      },
      findFirst: async (input: { readonly where: Record<string, unknown> }) => {
        const row = snapshotRows.get(String(input.where['id']));
        return row && inScope(row, input.where) ? row : null;
      },
      update: async () => {
        calls.snapshotUpdate += 1;
        throw new Error('SNAPSHOT_UPDATE_FORBIDDEN');
      },
      upsert: async () => {
        calls.snapshotUpsert += 1;
        throw new Error('SNAPSHOT_UPSERT_FORBIDDEN');
      },
    },
    dashboardPublicationIdempotencyRecord: {
      create: async (input: { readonly data: Record<string, unknown> }) => {
        calls.idempotencyCreate += 1;
        if (options.failAfterSnapshot) throw new Error('PUBLICATION_TRANSACTION_FAILURE');
        const key = idempotencyKey(input.data);
        if (idempotencyRows.has(key)) throw new Error('DUPLICATE_PUBLICATION_IDEMPOTENCY');
        idempotencyRows.set(key, structuredClone(input.data));
        return idempotencyRows.get(key)!;
      },
      findFirst: async (input: { readonly where: Record<string, unknown> }) =>
        idempotencyRows.get(idempotencyKey(input.where)) ?? null,
    },
    dashboardRefreshStateRecord: {
      upsert: async (input: {
        readonly where: Record<string, unknown>;
        readonly create: Record<string, unknown>;
        readonly update: Record<string, unknown>;
      }) => {
        calls.refreshUpsert += 1;
        const key = idempotencyKey({
          organizationId: input.create['organizationId'],
          workspaceId: input.create['workspaceId'],
          projectId: input.create['projectId'],
          keyValue: input.create['dashboardId'],
        });
        const current = refreshRows.get(key) ?? {};
        const row = { ...current, ...input.create, ...input.update };
        refreshRows.set(key, row);
        return row;
      },
    },
    dashboardPublicationAuditOutboxRecord: {
      create: async (input: { readonly data: Record<string, unknown> }) => {
        calls.auditCreate += 1;
        if (options.failAtAudit) throw new Error('PUBLICATION_AUDIT_OUTBOX_FAILURE');
        const key = idempotencyKey(input.data);
        outboxRows.set(key, structuredClone(input.data));
        return outboxRows.get(key)!;
      },
    },
    dashboardPublicationApprovalInvalidationOutboxRecord: {
      create: async (input: { readonly data: Record<string, unknown> }) => {
        calls.invalidationCreate += 1;
        calls.events.push('approval-invalidation-outbox');
        if (options.failAtInvalidation) throw new Error('PUBLICATION_INVALIDATION_OUTBOX_FAILURE');
        const key = `${idempotencyKey(input.data)}|${String(input.data['priorPublishedVersionId'])}`;
        if (invalidationRows.has(key)) throw new Error('DUPLICATE_PUBLICATION_INVALIDATION');
        invalidationRows.set(key, structuredClone(input.data));
        return invalidationRows.get(key)!;
      },
      findFirst: async (input: { readonly where: Record<string, unknown> }) => {
        const rows = [...invalidationRows.values()].filter((row) => inScope(row, input.where));
        const matches = rows.find((row) => {
          for (const [key, expected] of Object.entries(input.where)) {
            if (key === 'OR') continue;
            if (expected !== undefined && row[key] !== expected) return false;
          }
          const ors = input.where['OR'];
          if (!Array.isArray(ors)) return true;
          return ors.some((candidate) => {
            if (candidate === null || typeof candidate !== 'object') return false;
            return Object.entries(candidate as Record<string, unknown>).every(([key, expected]) => {
              if (key === 'OR') return true;
              if (expected === null) return row[key] === null;
              if (typeof expected === 'object' && expected !== null && 'lte' in expected) {
                const value = row[key];
                return (
                  value instanceof Date &&
                  value.getTime() <= (expected as { lte: Date }).lte.getTime()
                );
              }
              return row[key] === expected;
            });
          });
        });
        return matches ?? null;
      },
      updateMany: async (input: {
        readonly where: Record<string, unknown>;
        readonly data: Record<string, unknown>;
      }) => {
        const row = [...invalidationRows.values()].find((candidate) =>
          Object.entries(input.where).every(([key, expected]) => candidate[key] === expected),
        );
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(input.data)) {
          if (
            key === 'attempts' &&
            typeof value === 'object' &&
            value !== null &&
            'increment' in value
          ) {
            row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment);
          } else {
            row[key] = value;
          }
        }
        return { count: 1 };
      },
    },
  } as unknown as Record<string, unknown> & {
    $transaction: (callback: (transactionClient: unknown) => Promise<unknown>) => Promise<unknown>;
  };

  client.$transaction = async (callback) => {
    calls.transactions += 1;
    const identityBackup = structuredClone([...identityRows.entries()]);
    const snapshotBackup = structuredClone([...snapshotRows.entries()]);
    const idempotencyBackup = structuredClone([...idempotencyRows.entries()]);
    const refreshBackup = structuredClone([...refreshRows.entries()]);
    const outboxBackup = structuredClone([...outboxRows.entries()]);
    const invalidationBackup = structuredClone([...invalidationRows.entries()]);
    try {
      return await callback(client);
    } catch (error) {
      identityRows.clear();
      for (const [key, row] of identityBackup) identityRows.set(key, row);
      snapshotRows.clear();
      for (const [key, row] of snapshotBackup) snapshotRows.set(key, row);
      idempotencyRows.clear();
      for (const [key, row] of idempotencyBackup) idempotencyRows.set(key, row);
      refreshRows.clear();
      for (const [key, row] of refreshBackup) refreshRows.set(key, row);
      outboxRows.clear();
      for (const [key, row] of outboxBackup) outboxRows.set(key, row);
      invalidationRows.clear();
      for (const [key, row] of invalidationBackup) invalidationRows.set(key, row);
      throw error;
    }
  };

  return {
    client,
    identityRows,
    versionRows,
    snapshotRows,
    idempotencyRows,
    refreshRows,
    outboxRows,
    invalidationRows,
    calls,
  };
}

function publicationInput(
  overrides: Partial<PublicationCommitInputV1> = {},
): PublicationCommitInputV1 {
  return {
    tenantScope: scope,
    dashboardId: ids.dashboard,
    versionId: ids.version,
    expectedRevision: 1,
    idempotencyKey: 'publication-1',
    audience: 'WORKSPACE_VIEWERS',
    resolvedProjection: {
      materializations: [materialization()],
      bindingProof: bindingProof(),
      freshnessState: 'FRESH',
      evidenceState: 'AVAILABLE',
    },
    auditMetadata: {
      actorId: '00000000-0000-4000-8000-000000000024',
      correlationId: '00000000-0000-4000-8000-000000000025',
      authorizationEpoch: 1,
    },
    ...overrides,
  };
}

void test('[DDA-020] Prisma draft persistence fails closed on a duplicate immutable version ID', async () => {
  const storage = memoryClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(storage.client);
  const original = version();

  await repository.saveVersion(original);
  await assert.rejects(
    repository.saveVersion({ ...original, canonicalHash: 'b'.repeat(64) }),
    /DUPLICATE_DASHBOARD_VERSION_ID/,
  );

  assert.equal(storage.calls.create, 2);
  assert.equal(storage.calls.upsert, 0);
  assert.equal(
    (await repository.findVersion(scope, original.versionId))?.canonicalHash,
    original.canonicalHash,
  );
});

void test('[DDA-025][DDA-026][DDA-032][AUD-003] Prisma publication replays durably without mutating the immutable snapshot', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const first = await repository.commitPublication(publicationInput());
  assert.equal(first.accepted, true);
  if (!first.accepted) return;

  const restarted = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const replay = await restarted.commitPublication(publicationInput());
  assert.equal(replay.accepted, true);
  if (!replay.accepted) return;
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal(storage.snapshotRows.size, 1);
  assert.equal(storage.calls.snapshotCreate, 1);
  assert.equal(storage.calls.snapshotUpdate, 0);
  assert.equal(storage.calls.snapshotUpsert, 0);
  assert.equal(storage.calls.idempotencyCreate, 1);
  assert.equal(storage.refreshRows.size, 1);
  assert.equal(
    [...storage.refreshRows.values()][0]?.['lastSnapshotId'],
    first.snapshot['snapshotId'],
  );
  assert.equal(storage.outboxRows.size, 1);
  assert.equal([...storage.outboxRows.values()][0]?.['snapshotId'], first.snapshot['snapshotId']);
  assert.equal(
    [...storage.outboxRows.values()][0]?.['actorId'],
    '00000000-0000-4000-8000-000000000024',
  );
  assert.equal(
    [...storage.outboxRows.values()][0]?.['correlationId'],
    '00000000-0000-4000-8000-000000000025',
  );
  assert.equal([...storage.outboxRows.values()][0]?.['authorizationEpoch'], 1);
  const storedSnapshot = [...storage.snapshotRows.values()][0];
  assert.equal(storedSnapshot?.['inputSelectorHash'], first.snapshot['inputSelectorHash']);
  assert.deepEqual(storedSnapshot?.['materializationIds'], {
    version: 1,
    bindingProofVersion: 1,
    ids: first.snapshot['materializationIds'],
    inputSelectorHash: first.snapshot['inputSelectorHash'],
    bindingProof: bindingProof(),
  });
  assert.deepEqual(storedSnapshot?.['bindingProof'], bindingProof());
  if (storedSnapshot !== undefined) storedSnapshot['inputSelectorHash'] = null;
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 2);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['publishedVersionId'], ids.version);

  const refreshedReplay = await restarted.commitPublication(
    publicationInput({
      resolvedProjection: {
        materializations: [
          { ...materialization(), cacheIdentityHash: 'd'.repeat(64) } as DdaMaterializationV1,
        ],
        bindingProof: [
          {
            ...bindingProof()[0]!,
            materializationId: ids.materialization as never,
            widgetId: ids.widget as never,
            materializationDefinitionId: ids.materialization as never,
            resultManifestId: '00000000-0000-4000-8000-000000000023' as never,
            permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021' as never,
            cacheIdentityHash: 'd'.repeat(64),
          },
        ],
        freshnessState: 'STALE',
        evidenceState: 'PARTIAL',
      },
    }),
  );
  assert.equal(refreshedReplay.accepted, true);
  if (refreshedReplay.accepted) {
    assert.equal(refreshedReplay.replayed, true);
    assert.deepEqual(refreshedReplay.snapshot, first.snapshot);
  }

  const conflict = await restarted.commitPublication(publicationInput({ audience: 'OWNER' }));
  assert.deepEqual(conflict, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(storage.snapshotRows.size, 1);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 2);
});

void test('[DDA-025][AUD-003] Prisma publication enqueues prior-subject approval invalidation after the CAS and replays it once', async () => {
  const storage = publicationClient();
  const priorVersionId = '00000000-0000-4000-8000-000000000099';
  const prior = { ...version(), versionId: priorVersionId } as unknown as Record<string, unknown>;
  storage.versionRows.set(priorVersionId, {
    id: priorVersionId,
    ...prior,
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    layoutGraph: prior,
  });
  storage.identityRows.get(ids.dashboard)!['publishedVersionId'] = priorVersionId;
  storage.identityRows.get(ids.dashboard)!['status'] = 'PUBLISHED';
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const input = publicationInput({
    idempotencyKey: 'prior-approval-invalidation',
    approvalInvalidation: {
      tenantScope: scope,
      dashboardId: ids.dashboard,
      priorPublishedVersionId: priorVersionId,
    },
  });
  const first = await repository.commitPublication(input);
  assert.equal(first.accepted, true);
  assert.equal(storage.invalidationRows.size, 1);
  const invalidation = [...storage.invalidationRows.values()][0];
  assert.equal(invalidation?.['action'], 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS');
  assert.equal(invalidation?.['state'], 'PENDING');
  assert.equal(invalidation?.['priorPublishedVersionId'], priorVersionId);
  assert.ok(
    storage.calls.events.indexOf('dashboard-update') <
      storage.calls.events.indexOf('approval-invalidation-outbox'),
  );
  const replay = await repository.commitPublication(input);
  assert.equal(replay.accepted, true);
  assert.equal(storage.invalidationRows.size, 1);
  assert.equal(storage.calls.invalidationCreate, 1);
});

void test('[DDA-025][DDA-029][AUD-003] Prisma invalidation outbox has scoped leases, retry state, and idempotent completion', async () => {
  const storage = publicationClient();
  const priorVersionId = '00000000-0000-4000-8000-000000000099';
  const prior = { ...version(), versionId: priorVersionId } as unknown as Record<string, unknown>;
  storage.versionRows.set(priorVersionId, {
    id: priorVersionId,
    ...prior,
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    layoutGraph: prior,
  });
  storage.identityRows.get(ids.dashboard)!['publishedVersionId'] = priorVersionId;
  storage.identityRows.get(ids.dashboard)!['status'] = 'PUBLISHED';
  const repository = new PrismaDashboardDraftRepositoryAdapter(storage.client as never);
  const committed = await repository.commitPublication(
    publicationInput({
      idempotencyKey: 'worker-outbox',
      approvalInvalidation: {
        tenantScope: scope,
        dashboardId: ids.dashboard,
        priorPublishedVersionId: priorVersionId,
      },
    }),
  );
  assert.equal(committed.accepted, true);

  const firstClaim = await repository.claimNext({
    tenantScope: scope,
    workerId: 'worker-a',
    now: new Date('2999-01-01T00:00:00.000Z'),
    leaseDurationMs: 60_000,
  });
  assert.equal(firstClaim.accepted, true);
  if (!firstClaim.accepted || firstClaim.record === undefined) return;
  assert.equal(firstClaim.record.state, 'CLAIMED');
  assert.equal(firstClaim.record.attempts, 1);
  assert.deepEqual(
    await repository.markCompleted({
      tenantScope: scope,
      recordId: firstClaim.record.id,
      workerId: 'worker-b',
      now: new Date('2999-01-01T00:00:01.000Z'),
    }),
    { accepted: false, code: 'LEASE_CONFLICT' },
  );
  assert.deepEqual(
    await repository.markFailed({
      tenantScope: scope,
      recordId: firstClaim.record.id,
      workerId: 'worker-a',
      now: new Date('2999-01-01T00:00:01.000Z'),
      retryAt: new Date('2999-01-01T00:00:02.000Z'),
      error: 'temporary JRA outage',
    }),
    { accepted: true },
  );

  const retryClaim = await repository.claimNext({
    tenantScope: scope,
    workerId: 'worker-b',
    now: new Date('2999-01-01T00:00:02.000Z'),
    leaseDurationMs: 60_000,
  });
  assert.equal(retryClaim.accepted, true);
  if (!retryClaim.accepted || retryClaim.record === undefined) return;
  assert.equal(retryClaim.record.attempts, 2);
  assert.deepEqual(
    await repository.markCompleted({
      tenantScope: scope,
      recordId: retryClaim.record.id,
      workerId: 'worker-b',
      now: new Date('2999-01-01T00:00:03.000Z'),
    }),
    { accepted: true },
  );
  const idle = await repository.claimNext({
    tenantScope: scope,
    workerId: 'worker-b',
    now: new Date('2999-01-01T00:00:04.000Z'),
    leaseDurationMs: 60_000,
  });
  assert.deepEqual(idle, { accepted: true });
});

void test('[DDA-025][DDA-026] Prisma publication rejects a cross-tenant dashboard/version ID without creating a snapshot', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const result = await repository.commitPublication(
    publicationInput({
      tenantScope: {
        scopeType: 'project',
        organizationId: '00000000-0000-4000-8000-000000000101',
        workspaceId: '00000000-0000-4000-8000-000000000102',
        projectId: '00000000-0000-4000-8000-000000000103',
      } as unknown as TenantScopeV1,
      idempotencyKey: 'cross-tenant',
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'VERSION_NOT_FOUND' });
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
});

void test('[DDA-032] Prisma publication does not record a stale revision or partially publish', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const result = await repository.commitPublication(
    publicationInput({ expectedRevision: 0, idempotencyKey: 'stale' }),
  );
  assert.deepEqual(result, { accepted: false, code: 'REVISION_CONFLICT' });
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
  assert.equal(storage.refreshRows.size, 0);
  assert.equal(storage.outboxRows.size, 0);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 1);
});

void test('[DDA-025] Prisma replay preflight is scoped and returns the committed snapshot before mutable inputs', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const first = await repository.commitPublication(publicationInput());
  assert.equal(first.accepted, true);
  if (!first.accepted) return;

  const replay = await repository.findPublicationReplay({
    tenantScope: scope,
    dashboardId: ids.dashboard,
    versionId: ids.version,
    expectedRevision: 1,
    idempotencyKey: 'publication-1',
    audience: 'WORKSPACE_VIEWERS',
  });
  assert.equal(replay.kind, 'REPLAY');
  if (replay.kind === 'REPLAY') assert.deepEqual(replay.snapshot, first.snapshot);

  assert.deepEqual(
    await repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'publication-1',
      audience: 'OWNER',
    }),
    { kind: 'CONFLICT' },
  );
  assert.deepEqual(
    await repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 0,
      idempotencyKey: 'publication-1',
      audience: 'WORKSPACE_VIEWERS',
    }),
    { kind: 'CONFLICT' },
  );
  assert.deepEqual(
    await repository.findPublicationReplay({
      tenantScope: {
        scopeType: 'project',
        organizationId: '00000000-0000-4000-8000-000000000101',
        workspaceId: '00000000-0000-4000-8000-000000000102',
        projectId: '00000000-0000-4000-8000-000000000103',
      } as TenantScopeV1,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'publication-1',
      audience: 'WORKSPACE_VIEWERS',
    }),
    { kind: 'MISS' },
  );
});

void test('[DDA-025][DDA-026] Prisma replay rejects divergent or cache-inconsistent immutable binding proof columns and envelope', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const first = await repository.commitPublication(
    publicationInput({ idempotencyKey: 'proof-replay' }),
  );
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const storedSnapshot = storage.snapshotRows.get(first.snapshot['snapshotId'] as string);
  assert.ok(storedSnapshot);

  storedSnapshot['bindingProof'] = [
    {
      ...((storedSnapshot['bindingProof'] as readonly Record<string, unknown>[])[0] ?? {}),
      resultManifestId: '00000000-0000-4000-8000-000000000099',
    },
  ];
  await assert.rejects(
    repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'proof-replay',
      audience: 'WORKSPACE_VIEWERS',
    }),
    /DDA_PERSISTED_SNAPSHOT_INVALID/,
  );

  storedSnapshot['bindingProof'] = structuredClone(
    (storedSnapshot['materializationIds'] as Record<string, unknown>)['bindingProof'],
  );
  storedSnapshot['materializationIds'] = {
    ...(storedSnapshot['materializationIds'] as Record<string, unknown>),
    bindingProof: [
      {
        ...((storedSnapshot['bindingProof'] as readonly Record<string, unknown>[])[0] ?? {}),
        resultManifestId: '00000000-0000-4000-8000-000000000099',
      },
    ],
  };
  await assert.rejects(
    repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'proof-replay',
      audience: 'WORKSPACE_VIEWERS',
    }),
    /DDA_PERSISTED_SNAPSHOT_INVALID/,
  );
});

void test('[DDA-025][DDA-026] Prisma durable replay rejects a legacy snapshot when its current version policy is DRAFT_ONLY', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const first = await repository.commitPublication(
    publicationInput({ idempotencyKey: 'legacy-policy' }),
  );
  assert.equal(first.accepted, true);
  const versionRow = storage.versionRows.get(ids.version);
  assert.ok(versionRow);
  versionRow['layoutGraph'] = { ...version(), publicationPolicy: 'DRAFT_ONLY' };
  assert.deepEqual(
    await repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'legacy-policy',
      audience: 'WORKSPACE_VIEWERS',
    }),
    { kind: 'INVALID' },
  );
});

void test('[DDA-025][DDA-026] Prisma publication replay rejects proofless legacy snapshots instead of returning a base-hash result', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const first = await repository.commitPublication(
    publicationInput({ idempotencyKey: 'proofless-legacy' }),
  );
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const storedSnapshot = storage.snapshotRows.get(first.snapshot['snapshotId'] as string);
  assert.ok(storedSnapshot);
  storedSnapshot['bindingProof'] = null;
  storedSnapshot['bindingProofVersion'] = 0;
  storedSnapshot['materializationIds'] = {
    ids: (storedSnapshot['materializationIds'] as Record<string, unknown>)['ids'],
    inputSelectorHash: (storedSnapshot['materializationIds'] as Record<string, unknown>)[
      'inputSelectorHash'
    ],
    version: 1,
  };
  await assert.rejects(
    repository.findPublicationReplay({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: ids.version,
      expectedRevision: 1,
      idempotencyKey: 'proofless-legacy',
      audience: 'WORKSPACE_VIEWERS',
    }),
    /DDA_PERSISTED_SNAPSHOT_INVALID/u,
  );
});

void test('[DDA-032] Prisma publication rejects a resolved row bound to the wrong analysis plan', async () => {
  const storage = publicationClient();
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  const invalid = {
    ...materialization(),
    analysisPlanVersionId: '00000000-0000-4000-8000-000000000041' as never,
  } as DdaMaterializationV1;
  const result = await repository.commitPublication(
    publicationInput({
      idempotencyKey: 'wrong-plan',
      resolvedProjection: {
        materializations: [invalid],
        bindingProof: bindingProof(),
        freshnessState: 'FRESH',
        evidenceState: 'AVAILABLE',
      },
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'INVALID_SNAPSHOT' });
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
});

void test('[DDA-025][AUD-003] Prisma publication rolls back the identity, snapshot, and idempotency record on transaction failure', async () => {
  const storage = publicationClient({ failAfterSnapshot: true });
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  await assert.rejects(
    repository.commitPublication(publicationInput()),
    /PUBLICATION_TRANSACTION_FAILURE/,
  );
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
  assert.equal(storage.refreshRows.size, 0);
  assert.equal(storage.outboxRows.size, 0);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 1);
  assert.equal(storage.calls.transactions, 1);
});

void test('[DDA-025][AUD-003] publication migration keeps legacy audiences readable and binds new records by scope', async () => {
  const relativeMigration =
    'prisma/migrations/20260813010000_dda_dashboard_publications/migration.sql';
  const migration = await readFile(resolve(process.cwd(), relativeMigration), 'utf8').catch(() =>
    readFile(resolve(process.cwd(), 'services/api', relativeMigration), 'utf8'),
  );
  assert.match(
    migration,
    /CHECK \("audience" IN \('OWNER', 'WORKSPACE_VIEWERS', 'PROJECT_VIEWERS'\)\) NOT VALID/u,
  );
  assert.match(migration, /dashboard_publication_audit_outbox/u);
  assert.match(migration, /dashboard_publication_idempotency_scope_snapshot_fk/u);
  assert.match(migration, /dashboard_publication_idempotency_scope_dashboard_fk/u);
  assert.match(migration, /dashboard_publication_idempotency_scope_version_fk/u);
  assert.match(
    migration,
    /DEPLOYMENT PRECONDITION[\s\S]*legacy writer[\s\S]*before[\s\S]*migration/iu,
  );
  assert.match(migration, /OPERATOR VALIDATION GATE[\s\S]*NOT VALID/iu);
  assert.match(migration, /dashboard_publication_audit_scope_prior_version_fk/u);
  assert.match(migration, /ON DELETE RESTRICT/u);
  assert.match(migration, /dashboard_snapshots_binding_proof_pair_check/u);
});

void test('[DDA-025][AUD-003] publication migration has executable preflight and ordered later validation gates', async () => {
  const readMigrationAsset = async (name: string) => {
    const relative = `prisma/migrations/20260813010000_dda_dashboard_publications/${name}`;
    return readFile(resolve(process.cwd(), relative), 'utf8').catch(() =>
      readFile(resolve(process.cwd(), 'services/api', relative), 'utf8'),
    );
  };
  const migration = await readMigrationAsset('migration.sql');
  const preflight = await readMigrationAsset('preflight.sql');
  const validation = await readMigrationAsset('post-deploy-validate.sql');
  assert.match(preflight, /current_setting\('databreeze\.dda_publication_admission_blocked'/u);
  assert.match(preflight, /SHARED_LINK/u);
  assert.match(preflight, /RAISE EXCEPTION/u);
  assert.match(validation, /SHARED_LINK/u);
  assert.match(validation, /VALIDATE CONSTRAINT/u);
  assert.match(validation, /dashboard_snapshots_member_audience_check/u);
  assert.match(validation, /dashboard_snapshots_binding_proof_pair_check/u);
  assert.match(validation, /dashboard_snapshots_scope_version_fk/u);
  assert.match(validation, /dashboard_refresh_state_scope_dashboard_fk/u);
  assert.match(validation, /dashboard_refresh_state_scope_snapshot_fk/u);
  assert.doesNotMatch(migration, /^[ \t]*VALIDATE CONSTRAINT/mu);
});

void test('[AUD-003] publication rolls back when durable audit/outbox enqueue fails', async () => {
  const storage = publicationClient({ failAtAudit: true });
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  await assert.rejects(
    repository.commitPublication(publicationInput({ idempotencyKey: 'audit-failure' })),
    /PUBLICATION_AUDIT_OUTBOX_FAILURE/,
  );
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
  assert.equal(storage.refreshRows.size, 0);
  assert.equal(storage.outboxRows.size, 0);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 1);
});

void test('[DDA-025][AUD-003] publication rolls back the approval invalidation command with the snapshot transaction', async () => {
  const storage = publicationClient({ failAtInvalidation: true });
  const priorVersionId = '00000000-0000-4000-8000-000000000099';
  const prior = { ...version(), versionId: priorVersionId } as unknown as Record<string, unknown>;
  storage.versionRows.set(priorVersionId, {
    id: priorVersionId,
    ...prior,
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    layoutGraph: prior,
  });
  storage.identityRows.get(ids.dashboard)!['publishedVersionId'] = priorVersionId;
  storage.identityRows.get(ids.dashboard)!['status'] = 'PUBLISHED';
  const repository = new PrismaDashboardDraftRepositoryAdapter(
    storage.client as never,
  ) as unknown as PublicationCommitRepositoryV1;
  await assert.rejects(
    repository.commitPublication(
      publicationInput({
        idempotencyKey: 'invalidation-failure',
        approvalInvalidation: {
          tenantScope: scope,
          dashboardId: ids.dashboard,
          priorPublishedVersionId: priorVersionId,
        },
      }),
    ),
    /PUBLICATION_INVALIDATION_OUTBOX_FAILURE/,
  );
  assert.equal(storage.snapshotRows.size, 0);
  assert.equal(storage.idempotencyRows.size, 0);
  assert.equal(storage.invalidationRows.size, 0);
  assert.equal(storage.identityRows.get(ids.dashboard)?.['revision'], 1);
});
