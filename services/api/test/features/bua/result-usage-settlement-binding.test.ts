import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaResultUsageSettlementBindingRepository,
  type ResultUsageSettlementBindingDatabaseClientV1,
  type ResultUsageSettlementBindingDatabaseRowV1,
} from '../../../src/features/bua/adapter/prisma-result-usage-settlement-binding-repository.adapter.js';
import type { ResultUsageSettlementBindingV1 } from '../../../src/features/bua/application/result-usage-settlement-binding.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000101';
const workspaceId = '00000000-0000-4000-8000-000000000102';
const bindingId = '00000000-0000-4000-8000-000000000103';
const jobId = '00000000-0000-4000-8000-000000000104';
const reservationId = '00000000-0000-4000-8000-000000000105';

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId: '00000000-0000-4000-8000-000000000106',
    correlationId: '00000000-0000-4000-8000-000000000107',
    idempotencyKey: 'admission-1',
    authorizationEpoch: 7,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid context');
  return parsed.value;
}

function binding(): ResultUsageSettlementBindingV1 {
  return {
    schemaVersion: 1,
    bindingId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    jobId,
    reservationId,
    meter: 'artifact_bytes',
    settlementFormula: 'COMMITTED_OUTPUT_BYTES',
    maximumAdmittedUnits: 4096,
    entitlementDecisionSubjectHash: 'a'.repeat(64),
    admissionIdempotencyKey: 'admission-1',
    state: 'PREPARED',
    createdAt: '2026-08-14T00:00:00.000Z',
    expiresAt: '2026-08-14T01:00:00.000Z',
    revision: 1,
  } as ResultUsageSettlementBindingV1;
}

function database(rows: ResultUsageSettlementBindingDatabaseRowV1[]) {
  const delegate = {
    create({ data }: { readonly data: ResultUsageSettlementBindingDatabaseRowV1 }) {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value),
        ) ?? null,
      );
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }) {
      const index = rows.findIndex((row) =>
        Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value),
      );
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data } as ResultUsageSettlementBindingDatabaseRowV1;
      return Promise.resolve({ count: 1 });
    },
  };
  const client = {
    resultUsageSettlementBindingRecord: delegate,
    $transaction: <TValue>(
      work: (transaction: ResultUsageSettlementBindingDatabaseClientV1) => Promise<TValue>,
    ) => work(client),
  } as ResultUsageSettlementBindingDatabaseClientV1;
  return client;
}

void test('[Plan 407 Task 7 / BUA-023] persists immutable exact settlement authority and replays identical admission', async () => {
  const rows: ResultUsageSettlementBindingDatabaseRowV1[] = [];
  const repository = new PrismaResultUsageSettlementBindingRepository(database(rows));

  await repository.withTransaction(context(), async (transaction) => {
    await transaction.save(context(), binding());
    await transaction.save(context(), binding());
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.reservationId, reservationId);
  assert.equal(rows[0]?.settlementFormula, 'COMMITTED_OUTPUT_BYTES');
  assert.equal(rows[0]?.maximumAdmittedUnits, 4096n);
});

void test('[Plan 407 Task 7 / BUA-023] rejects altered admission and cross-scope reads', async () => {
  const rows: ResultUsageSettlementBindingDatabaseRowV1[] = [];
  const repository = new PrismaResultUsageSettlementBindingRepository(database(rows));
  await repository.save(context(), binding());

  await assert.rejects(
    repository.save(context(), { ...binding(), maximumAdmittedUnits: 4097 }),
    /BUA_IMMUTABLE_RESULT_USAGE_SETTLEMENT_BINDING/,
  );
  const sibling = createIamTenantContextV1({
    ...context(),
    tenantScope: {
      scopeType: 'workspace',
      organizationId,
      workspaceId: '00000000-0000-4000-8000-000000000108',
    },
  });
  assert.equal(sibling.accepted, true);
  if (!sibling.accepted) return;
  assert.equal(await repository.find(sibling.value, binding().bindingId), undefined);
});

void test('[Plan 407 Task 7 / BUA-023] settles only one prepared revision', async () => {
  const rows: ResultUsageSettlementBindingDatabaseRowV1[] = [];
  const repository = new PrismaResultUsageSettlementBindingRepository(database(rows));
  await repository.save(context(), binding());

  const settled = await repository.markSettled(context(), binding().bindingId, 1);
  assert.equal(settled.state, 'SETTLED');
  assert.equal(settled.revision, 2);
  await assert.rejects(
    repository.markSettled(context(), binding().bindingId, 1),
    /BUA_SETTLEMENT_BINDING_CONFLICT/,
  );
});
