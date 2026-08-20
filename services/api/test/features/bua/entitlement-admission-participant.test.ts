import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EntitlementSnapshotDatabaseRowV1,
  EntitlementDatabaseClientV1,
  UsageLedgerEntryDatabaseRowV1,
  UsageReservationDatabaseRowV1,
} from '../../../src/features/bua/adapter/prisma-entitlement-repository.adapter.js';
import { PrismaEntitlementAdmissionParticipantAdapter } from '../../../src/features/bua/adapter/prisma-entitlement-admission-participant.adapter.js';
import type { EntitlementAdmissionParticipantInputV1 } from '../../../src/features/bua/application/entitlement-admission-participant.port.js';
import type {
  ResultUsageSettlementBindingDatabaseClientV1,
  ResultUsageSettlementBindingDatabaseRowV1,
} from '../../../src/features/bua/adapter/prisma-result-usage-settlement-binding-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000301';
const workspaceId = '00000000-0000-4000-8000-000000000302';
const snapshotId = '00000000-0000-4000-8000-000000000303';
const bindingId = '00000000-0000-4000-8000-000000000304';
const jobId = '00000000-0000-4000-8000-000000000305';
const reservationId = '00000000-0000-4000-8000-000000000306';
const entryId = '00000000-0000-4000-8000-000000000307';
const actorId = '00000000-0000-4000-8000-000000000308';
const correlationId = '00000000-0000-4000-8000-000000000309';
const now = '2026-08-19T00:00:00.000Z';

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey: 'jra-admission-1',
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test context');
  return parsed.value;
}

function matches(row: Record<string, unknown>, where: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR' && Array.isArray(value)) {
      return value.some((candidate) =>
        typeof candidate === 'object' && candidate !== null
          ? matches(row, candidate as Record<string, unknown>)
          : false,
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
}

function database() {
  const snapshots: EntitlementSnapshotDatabaseRowV1[] = [];
  const entries: UsageLedgerEntryDatabaseRowV1[] = [];
  const reservations: UsageReservationDatabaseRowV1[] = [];
  const bindings: ResultUsageSettlementBindingDatabaseRowV1[] = [];
  const delegate = (rows: Array<Record<string, unknown>>) => ({
    create({ data }: { readonly data: Record<string, unknown> }) {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    findUnique({ where }: { readonly where: Record<string, unknown> }) {
      return Promise.resolve(
        rows.find((row) => row['id'] === where['id'] || row['planCode'] === where['planCode']) ??
          null,
      );
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(rows.find((row) => matches(row, where)) ?? null);
    },
    findMany({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(rows.filter((row) => matches(row, where)));
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }) {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) return Promise.resolve({ count: 0 });
      Object.assign(row, data);
      return Promise.resolve({ count: 1 });
    },
  });
  const client = {
    entitlementPlanRecord: delegate([]),
    entitlementSnapshotRecord: delegate(snapshots as unknown as Array<Record<string, unknown>>),
    usageLedgerEntryRecord: delegate(entries as unknown as Array<Record<string, unknown>>),
    usageReservationRecord: delegate(reservations as unknown as Array<Record<string, unknown>>),
    resultUsageSettlementBindingRecord: delegate(
      bindings as unknown as Array<Record<string, unknown>>,
    ),
    $transaction<TValue>(work: (transaction: typeof client) => Promise<TValue>) {
      return work(client);
    },
  } as unknown as EntitlementDatabaseClientV1 & ResultUsageSettlementBindingDatabaseClientV1;
  return { client, snapshots, entries, reservations, bindings };
}

function snapshot(): EntitlementSnapshotDatabaseRowV1 {
  return {
    id: snapshotId,
    schemaVersion: 1,
    scopeKey: `workspace:${organizationId}:${workspaceId}`,
    scopeType: 'workspace',
    organizationId,
    workspaceId,
    planCode: 'development',
    status: 'ACTIVE',
    revision: 1,
    securityEpoch: 1,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 3 }],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function input(): EntitlementAdmissionParticipantInputV1 {
  return {
    entitlement: {
      snapshotId,
      feature: 'job.execute',
      reservationId,
      entryId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      metric: 'job_count',
      requestedUnits: 1,
      idempotencyKey: 'jra-admission-1',
      now,
    },
    binding: {
      schemaVersion: 1 as const,
      bindingId,
      tenantScope: { scopeType: 'workspace' as const, organizationId, workspaceId },
      jobId,
      reservationId,
      meter: 'job_count' as const,
      settlementFormula: 'SUCCESSFUL_JOB_UNIT' as const,
      maximumAdmittedUnits: 1,
      entitlementDecisionSubjectHash: 'a'.repeat(64),
      admissionIdempotencyKey: 'jra-admission-1',
      state: 'PREPARED' as const,
      createdAt: now as `${string}Z`,
      expiresAt: '2026-08-19T01:00:00.000Z' as `${string}Z`,
      revision: 1,
    },
  } as EntitlementAdmissionParticipantInputV1;
}

void test('[Plan 425 / BUA-023] reserves entitlement and binding on the same transaction participant', async () => {
  const state = database();
  state.snapshots.push(snapshot());
  const participant = new PrismaEntitlementAdmissionParticipantAdapter();
  const result = await participant.admit(state.client, context(), input());
  assert.equal(result.accepted, true);
  assert.equal(state.entries.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.equal(state.bindings.length, 1);
  assert.equal(state.bindings[0]?.reservationId, reservationId);
  assert.equal(state.bindings[0]?.jobId, jobId);
});

void test('[Plan 425 / BUA-023] identical reservation replays while changed idempotency is rejected', async () => {
  const state = database();
  state.snapshots.push(snapshot());
  const participant = new PrismaEntitlementAdmissionParticipantAdapter();
  const first = await participant.admit(state.client, context(), input());
  assert.equal(first.accepted, true);
  const replay = await participant.admit(state.client, context(), input());
  assert.equal(replay.accepted, true);
  assert.equal(state.entries.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.equal(state.bindings.length, 1);
  const original = input();
  const changed: EntitlementAdmissionParticipantInputV1 = {
    ...original,
    entitlement: { ...original.entitlement, idempotencyKey: 'different' },
    binding: { ...original.binding, admissionIdempotencyKey: 'different' },
  };
  const conflict = await participant.admit(state.client, context(), changed);
  assert.equal(conflict.accepted, false);
  if (!conflict.accepted) assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');
});
