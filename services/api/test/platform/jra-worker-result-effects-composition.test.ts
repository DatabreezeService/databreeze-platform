import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuditEventDatabaseRowV1 } from '../../src/features/aud/adapter/prisma-audit-repository.adapter.js';
import type {
  UsageLedgerEntryDatabaseRowV1,
  UsageReservationDatabaseRowV1,
} from '../../src/features/bua/adapter/prisma-entitlement-repository.adapter.js';
import type { ResultUsageSettlementBindingDatabaseRowV1 } from '../../src/features/bua/adapter/prisma-result-usage-settlement-binding-repository.adapter.js';
import type {
  JraWorkerDatabaseClientV1,
  WorkerResultFinalizationEffectV1,
} from '../../src/features/jra/worker/prisma-worker-adapter.js';
import { PrismaWorkerResultFinalizationEffects } from '../../src/platform/jra-worker-result-effects.composition.js';

const organizationId = '00000000-0000-4000-8000-000000000301';
const workspaceId = '00000000-0000-4000-8000-000000000302';
const bindingId = '00000000-0000-4000-8000-000000000303';
const jobId = '00000000-0000-4000-8000-000000000304';
const reservationId = '00000000-0000-4000-8000-000000000305';

function matches(row: Record<string, unknown>, where: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (typeof value === 'object' && value !== null && 'in' in value)
      return (value as { readonly in: readonly unknown[] }).in.includes(row[key]);
    return row[key] === value;
  });
}

function delegate<TRow extends Record<string, unknown>>(rows: TRow[]) {
  return {
    create({ data }: { readonly data: TRow }) {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    findFirst({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const found = rows.filter((row) => matches(row, where));
      const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
      if (field)
        found.sort((left, right) =>
          direction === 'desc'
            ? Number(right[field]) - Number(left[field])
            : Number(left[field]) - Number(right[field]),
        );
      return Promise.resolve(found[0] ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const found = rows.filter((row) => matches(row, where));
      const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
      if (field)
        found.sort((left, right) =>
          direction === 'desc'
            ? Number(right[field]) - Number(left[field])
            : Number(left[field]) - Number(right[field]),
        );
      return Promise.resolve(found);
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }) {
      const index = rows.findIndex((row) => matches(row, where));
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data } as TRow;
      return Promise.resolve({ count: 1 });
    },
  };
}

function fixture() {
  const scopeKey = `workspace:${organizationId}:${workspaceId}`;
  const entries: UsageLedgerEntryDatabaseRowV1[] = [
    {
      id: '00000000-0000-4000-8000-000000000306',
      schemaVersion: 1,
      scopeKey,
      scopeType: 'workspace',
      organizationId,
      workspaceId,
      projectId: null,
      metric: 'artifact_bytes',
      bucket: 'RESERVED',
      deltaUnits: 50n,
      sequence: 1,
      reservationId,
      idempotencyKey: 'job-admission',
      occurredAt: new Date('2026-08-14T00:00:00.000Z'),
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
    },
  ];
  const reservations: UsageReservationDatabaseRowV1[] = [
    {
      id: reservationId,
      scopeKey,
      scopeType: 'workspace',
      organizationId,
      workspaceId,
      projectId: null,
      metric: 'artifact_bytes',
      reservedUnits: 50n,
      status: 'ACTIVE',
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
      revision: 1,
      updatedAt: new Date('2026-08-14T00:00:00.000Z'),
    },
  ];
  const bindings: ResultUsageSettlementBindingDatabaseRowV1[] = [
    {
      id: bindingId,
      schemaVersion: 1,
      scopeKey,
      scopeType: 'workspace',
      organizationId,
      workspaceId,
      projectId: null,
      jobId,
      reservationId,
      meter: 'artifact_bytes',
      settlementFormula: 'COMMITTED_OUTPUT_BYTES',
      maximumAdmittedUnits: 50n,
      entitlementDecisionSubjectHash: 'a'.repeat(64),
      admissionIdempotencyKey: 'job-admission',
      state: 'PREPARED',
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
      expiresAt: new Date('2026-08-14T01:00:00.000Z'),
      revision: 1,
    },
  ];
  const auditEvents: AuditEventDatabaseRowV1[] = [];
  const transaction = {
    usageLedgerEntryRecord: delegate(entries as unknown as Record<string, unknown>[]),
    usageReservationRecord: delegate(reservations as unknown as Record<string, unknown>[]),
    resultUsageSettlementBindingRecord: delegate(bindings as unknown as Record<string, unknown>[]),
    auditEventRecord: delegate(auditEvents as unknown as Record<string, unknown>[]),
    auditSealRecord: delegate([]),
    $transaction() {
      throw new Error('nested transaction forbidden');
    },
  } as unknown as JraWorkerDatabaseClientV1;
  return { transaction, entries, reservations, bindings, auditEvents };
}

function effect(overrides: Partial<WorkerResultFinalizationEffectV1> = {}) {
  return {
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId: '00000000-0000-4000-8000-000000000307',
    correlationId: '00000000-0000-4000-8000-000000000308',
    authorizationEpoch: 7,
    jobId,
    attemptId: '00000000-0000-4000-8000-000000000309',
    submissionId: '00000000-0000-4000-8000-000000000310',
    resultManifestId: '00000000-0000-4000-8000-000000000311',
    resultManifestHash: 'b'.repeat(64),
    artifactVersionIds: ['00000000-0000-4000-8000-000000000312'],
    outputBytes: 25,
    occurredAt: '2026-08-14T00:30:00.000Z',
    jobRevision: 4,
    resultUsageSettlementBindingId: bindingId,
    ...overrides,
  } as unknown as WorkerResultFinalizationEffectV1;
}

void test('[Plan 407 Task 7 / AUD-001 / BUA-023 / JRA-032] settles canonical usage and audit in the supplied transaction', async () => {
  const state = fixture();
  await new PrismaWorkerResultFinalizationEffects().commit(state.transaction, effect());

  assert.equal(state.bindings[0]?.state, 'SETTLED');
  assert.equal(state.reservations[0]?.status, 'FINALIZED');
  assert.deepEqual(
    state.entries.map((entry) => Number(entry.deltaUnits)),
    [50, -50, 25],
  );
  assert.equal(state.auditEvents.length, 1);
  assert.equal(state.auditEvents[0]?.action, 'job.completed');
  assert.equal(state.auditEvents[0]?.entityRevision, 4);
});

void test('[Plan 407 Task 7 / BUA-023] rejects over-cap and missing authority before side effects', async () => {
  const overCap = fixture();
  await assert.rejects(
    new PrismaWorkerResultFinalizationEffects().commit(
      overCap.transaction,
      effect({ outputBytes: 51 }),
    ),
    /BUA_RESULT_USAGE_SETTLEMENT_REJECTED/,
  );
  assert.equal(overCap.entries.length, 1);
  assert.equal(overCap.auditEvents.length, 0);

  const missing = fixture();
  missing.bindings.splice(0);
  await assert.rejects(
    new PrismaWorkerResultFinalizationEffects().commit(missing.transaction, effect()),
    /BUA_RESULT_USAGE_SETTLEMENT_REJECTED/,
  );
  assert.equal(missing.entries.length, 1);
  assert.equal(missing.auditEvents.length, 0);
});
