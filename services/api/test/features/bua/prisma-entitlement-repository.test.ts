import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlanV1,
  type EntitlementPlanV1,
  type EntitlementSnapshotV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  tenantScopeKeyV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaEntitlementRepositoryAdapter,
  type EntitlementDatabaseClientV1,
} from '../../../src/features/bua/adapter/prisma-entitlement-repository.adapter.js';
import { EntitlementAdmissionService } from '../../../src/features/bua/application/entitlement-admission.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000201';
const workspaceId = '00000000-0000-4000-8000-000000000202';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000203';
const projectId = '00000000-0000-4000-8000-000000000204';
const actorId = '00000000-0000-4000-8000-000000000210';
const correlationId = '00000000-0000-4000-8000-000000000211';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(workspace = workspaceId, idempotencyKey = 'bua') {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid entitlement context');
  return result.value;
}

function projectContext(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'project', organizationId, workspaceId, projectId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid project entitlement context');
  return result.value;
}

function plan(): EntitlementPlanV1 {
  const result = createPlanV1({
    planCode: 'development',
    displayNameKey: 'plan.development',
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 3 }],
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid plan');
  return result.value;
}

function snapshot(): EntitlementSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: stable('00000000-0000-4000-8000-000000000220'),
    organizationId: stable(organizationId),
    workspaceId: stable(workspaceId),
    planCode: 'development',
    status: 'ACTIVE',
    revision: 1,
    securityEpoch: 1,
    effectiveAt: '2026-01-01T00:00:00.000Z' as StrictUtcTimestampV1,
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 3 }],
  };
}

function delegate<TRow extends Record<string, unknown>>(
  rows: TRow[],
  forceRevisionConflict = false,
  firstQueries?: Array<Readonly<Record<string, unknown>>>,
  manyQueries?: Array<Readonly<Record<string, unknown>>>,
) {
  const matches = (row: TRow, where: Readonly<Record<string, unknown>>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR' && Array.isArray(value)) {
        return value.some(
          (candidate) =>
            typeof candidate === 'object' &&
            candidate !== null &&
            matches(row, candidate as Readonly<Record<string, unknown>>),
        );
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        'in' in value &&
        Array.isArray((value as { readonly in?: unknown }).in)
      ) {
        return (value as { readonly in: readonly unknown[] }).in.includes(row[key]);
      }
      return row[key] === value;
    });
  return {
    create({ data }: { readonly data: TRow }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findUnique({
      where,
    }: {
      readonly where: { readonly id?: string; readonly planCode?: string };
    }) {
      const key = where.id ?? where.planCode;
      return Promise.resolve(
        rows.find((row) => row['id'] === key || row['planCode'] === key) ?? null,
      );
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      firstQueries?.push(where);
      return Promise.resolve(rows.find((row) => matches(row, where)) ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      manyQueries?.push(where);
      const filtered = rows.filter((row) => matches(row, where));
      const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
      return Promise.resolve(
        [...filtered].sort((left, right) => {
          if (!field) return 0;
          const comparison =
            left[field]! < right[field]! ? -1 : left[field]! > right[field]! ? 1 : 0;
          return direction === 'desc' ? -comparison : comparison;
        }),
      );
    },
    update({
      where,
      data,
    }: {
      readonly where: { readonly id: string };
      readonly data: Record<string, unknown>;
    }) {
      const index = rows.findIndex((row) => row['id'] === where.id);
      if (index < 0) throw new Error('row not found');
      rows[index] = { ...rows[index], ...data } as TRow;
      return Promise.resolve(rows[index]);
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: { readonly id: string; readonly revision: number };
      readonly data: Record<string, unknown>;
    }) {
      if (forceRevisionConflict) return Promise.resolve({ count: 0 });
      const index = rows.findIndex((row) => matches(row, where));
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data } as TRow;
      return Promise.resolve({ count: 1 });
    },
  };
}

function client(
  options: {
    readonly forceRevisionConflict?: boolean;
    readonly firstQueries?: Array<Readonly<Record<string, unknown>>>;
    readonly manyQueries?: Array<Readonly<Record<string, unknown>>>;
    readonly transactionCalls?: { value: number };
  } = {},
): EntitlementDatabaseClientV1 {
  const planRows: Record<string, unknown>[] = [];
  const snapshotRows: Record<string, unknown>[] = [];
  const entryRows: Record<string, unknown>[] = [];
  const reservationRows: Record<string, unknown>[] = [];
  const database = {
    entitlementPlanRecord: delegate(planRows),
    entitlementSnapshotRecord: delegate(snapshotRows, false, options.firstQueries),
    usageLedgerEntryRecord: delegate(entryRows, false, options.firstQueries, options.manyQueries),
    usageReservationRecord: delegate(
      reservationRows,
      options.forceRevisionConflict,
      options.firstQueries,
      options.manyQueries,
    ),
    async $transaction<TValue>(
      work: (transaction: EntitlementDatabaseClientV1) => Promise<TValue>,
    ): Promise<TValue> {
      if (options.transactionCalls) options.transactionCalls.value += 1;
      return work(database as unknown as EntitlementDatabaseClientV1);
    },
  };
  return database as unknown as EntitlementDatabaseClientV1;
}

function admissionInput(idempotencyKey: string, suffix: string) {
  const ids: Record<string, { reservationId: string; entryId: string }> = {
    '1': {
      reservationId: '00000000-0000-4000-8000-000000000221',
      entryId: '00000000-0000-4000-8000-000000000231',
    },
    '2': {
      reservationId: '00000000-0000-4000-8000-000000000222',
      entryId: '00000000-0000-4000-8000-000000000232',
    },
  };
  const selected = ids[suffix];
  if (!selected) throw new Error('unknown fixture suffix');
  return {
    snapshotId: snapshot().snapshotId,
    feature: 'job.execute',
    reservationId: stable(selected.reservationId),
    entryId: stable(selected.entryId),
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    metric: 'job_count',
    requestedUnits: 1,
    idempotencyKey,
    now: '2026-01-01T00:01:00.000Z',
  };
}

void test('[BUA-001, BUA-002, BUA-008, IAM-009] Prisma entitlement adapter persists immutable plans, snapshots, and scoped usage', async () => {
  const repository = new PrismaEntitlementRepositoryAdapter(client());
  await repository.savePlan(plan());
  await repository.saveSnapshot(context(workspaceId, 'seed-1'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const result = await service.admit(
    context(workspaceId, 'admit-1'),
    admissionInput('admit-1', '1'),
  );
  assert.equal(result.accepted, true);
  assert.equal((await repository.listUsageState(context(workspaceId, 'read'))).entries.length, 1);
  assert.equal(
    (await repository.listUsageState(context(siblingWorkspaceId, 'sibling'))).entries.length,
    0,
  );
  assert.equal(
    await repository.findSnapshot(
      context(siblingWorkspaceId, 'snapshot-sibling'),
      snapshot().snapshotId,
    ),
    undefined,
  );
});

void test('[BUA-008, BUA-011] Prisma entitlement adapter rejects duplicate usage identities', async () => {
  const repository = new PrismaEntitlementRepositoryAdapter(client());
  await repository.saveSnapshot(context(workspaceId, 'duplicate-snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(
    context(workspaceId, 'duplicate-admit'),
    admissionInput('duplicate-admit', '1'),
  );
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  const entry = admitted.value.state.entries[0];
  const reservation = admitted.value.state.reservations[0];
  if (!entry || !reservation) throw new Error('fixture usage state missing');
  await assert.rejects(
    repository.persistUsageState(context(workspaceId, 'duplicate-entry'), {
      ...admitted.value.state,
      entries: [entry, entry],
    }),
    /BUA_USAGE_STATE_CONFLICT/u,
  );
  await assert.rejects(
    repository.persistUsageState(context(workspaceId, 'duplicate-reservation'), {
      ...admitted.value.state,
      reservations: [reservation, reservation],
    }),
    /BUA_USAGE_STATE_CONFLICT/u,
  );
});

void test('[BUA-008, IAM-009] Prisma entitlement adapter round-trips project-scoped usage', async () => {
  const repository = new PrismaEntitlementRepositoryAdapter(client());
  await repository.saveSnapshot(context(workspaceId, 'project-snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const input = admissionInput('project-admit', '1');
  const admitted = await service.admit(projectContext('project-admit'), {
    ...input,
    tenantScope: { scopeType: 'project', organizationId, workspaceId, projectId },
  });
  assert.equal(admitted.accepted, true);

  const state = await repository.listUsageState(projectContext('project-read'));
  assert.equal(state.entries.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.deepEqual(state.entries[0]?.tenantScope, {
    scopeType: 'project',
    organizationId,
    workspaceId,
    projectId,
  });
  assert.deepEqual(state.reservations[0]?.tenantScope, {
    scopeType: 'project',
    organizationId,
    workspaceId,
    projectId,
  });
});

void test('[BUA-008, IAM-009] inherited usage reads use one scope-key query per record family', async () => {
  const manyQueries: Array<Readonly<Record<string, unknown>>> = [];
  const repository = new PrismaEntitlementRepositoryAdapter(client({ manyQueries }));
  await repository.saveSnapshot(context(workspaceId, 'batched-snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(projectContext('batched-admit'), {
    ...admissionInput('batched-admit', '1'),
    tenantScope: { scopeType: 'project', organizationId, workspaceId, projectId },
  });
  assert.equal(admitted.accepted, true);

  manyQueries.length = 0;
  await repository.listUsageState(projectContext('batched-read'));
  assert.equal(manyQueries.length, 2);
  const expectedKeys = [
    tenantScopeKeyV1({ scopeType: 'organization', organizationId: stable(organizationId) }),
    tenantScopeKeyV1({
      scopeType: 'workspace',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
    }),
    tenantScopeKeyV1({
      scopeType: 'project',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
      projectId: stable(projectId),
    }),
  ];
  for (const query of manyQueries) {
    assert.deepEqual(query['scopeKey'], { in: expectedKeys });
  }
});

void test('[BUA-008, BUA-011] direct usage persistence executes in one database transaction', async () => {
  const transactionCalls = { value: 0 };
  const repository = new PrismaEntitlementRepositoryAdapter(client({ transactionCalls }));

  await repository.persistUsageState(context(workspaceId, 'transactional-usage'), {
    entries: [],
    reservations: [],
  });

  assert.equal(transactionCalls.value, 1);
});

void test('[BUA-012] Prisma entitlement adapter applies reservation status revisions and preserves idempotent settlement', async () => {
  const repository = new PrismaEntitlementRepositoryAdapter(client());
  await repository.saveSnapshot(context(workspaceId, 'seed-2'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(
    context(workspaceId, 'admit-2'),
    admissionInput('admit-2', '2'),
  );
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  const finalized = await service.finalize(context(workspaceId, 'finish-2'), {
    reservationId: admitted.value.reservation.reservationId,
    releaseEntryId: stable('00000000-0000-4000-8000-000000000322'),
    commitEntryId: stable('00000000-0000-4000-8000-000000000323'),
    committedUnits: 1,
    now: '2026-01-01T00:02:00.000Z',
    idempotencyKey: 'finish-2',
  });
  assert.equal(finalized.accepted, true);
  assert.deepEqual(
    await service.finalize(context(workspaceId, 'finish-2'), {
      reservationId: admitted.value.reservation.reservationId,
      releaseEntryId: stable('00000000-0000-4000-8000-000000000322'),
      commitEntryId: stable('00000000-0000-4000-8000-000000000323'),
      committedUnits: 1,
      now: '2026-01-01T00:02:00.000Z',
      idempotencyKey: 'finish-2',
    }),
    finalized,
  );
});

void test('[BUA-012] Prisma entitlement adapter rejects a reservation settlement race', async () => {
  const repository = new PrismaEntitlementRepositoryAdapter(
    client({ forceRevisionConflict: true }),
  );
  await repository.saveSnapshot(context(workspaceId, 'seed-race'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(
    context(workspaceId, 'admit-race'),
    admissionInput('admit-race', '1'),
  );
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  await assert.rejects(
    service.finalize(context(workspaceId, 'finish-race'), {
      reservationId: admitted.value.reservation.reservationId,
      releaseEntryId: stable('00000000-0000-4000-8000-000000000241'),
      commitEntryId: stable('00000000-0000-4000-8000-000000000242'),
      committedUnits: 1,
      now: '2026-01-01T00:02:00.000Z',
      idempotencyKey: 'finish-race',
    }),
    /BUA_RESERVATION_CONFLICT/u,
  );
});

void test('[BUA-003, BUA-004, IAM-009] Prisma entitlement identity lookups include tenant scope', async () => {
  const firstQueries: Array<Readonly<Record<string, unknown>>> = [];
  const repository = new PrismaEntitlementRepositoryAdapter(client({ firstQueries }));
  await repository.saveSnapshot(context(workspaceId, 'scope-snapshot'), snapshot());
  await repository.findSnapshot(context(workspaceId, 'scope-read'), snapshot().snapshotId);
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(
    context(workspaceId, 'scope-admit'),
    admissionInput('scope-admit', '1'),
  );
  assert.equal(admitted.accepted, true);

  const tenantQueries = firstQueries.filter((query) => query['id'] !== undefined);
  assert.ok(tenantQueries.length >= 4);
  for (const query of tenantQueries) assert.equal(query['organizationId'], organizationId);
});
