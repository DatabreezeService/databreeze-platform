import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlanV1,
  type EntitlementPlanV1,
  type EntitlementSnapshotV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { EntitlementAdmissionService } from '../../../src/features/bua/application/entitlement-admission.service.js';
import { InMemoryEntitlementRepositoryAdapter } from '../../../src/features/bua/adapter/in-memory-entitlement-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid stable identifier');
  return parsed.value;
}

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function plan(): EntitlementPlanV1 {
  const result = createPlanV1({
    planCode: 'development',
    displayNameKey: 'plan.development',
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 2 }],
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid plan');
  return result.value;
}

function snapshot(): EntitlementSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: stable('00000000-0000-4000-8000-000000000020'),
    organizationId: stable(organizationId),
    workspaceId: stable(workspaceId),
    planCode: 'development',
    status: 'ACTIVE',
    revision: 1,
    securityEpoch: 1,
    effectiveAt: '2026-01-01T00:00:00.000Z' as StrictUtcTimestampV1,
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 2 }],
  };
}

function admissionInput(idempotencyKey: string, suffix: string) {
  return {
    snapshotId: snapshot().snapshotId,
    feature: 'job.execute',
    reservationId: stable(`00000000-0000-4000-8000-0000000000${suffix}`),
    entryId: stable(`00000000-0000-4000-8000-0000000001${suffix}`),
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    metric: 'job_count',
    requestedUnits: 1,
    idempotencyKey,
    now: '2026-01-01T00:01:00.000Z',
  };
}

void test('[BUA-004, BUA-008, BUA-009, BUA-011] admission evaluates feature and reserves usage atomically', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  await repository.savePlan(plan());
  await repository.saveSnapshot(context('snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const result = await service.admit(context('job-1'), admissionInput('job-1', '21'));
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.reservation.status, 'ACTIVE');
  assert.equal(result.value.state.entries[0]?.bucket, 'RESERVED');
  assert.equal((await repository.listUsageState(context('read'))).entries.length, 1);
  assert.deepEqual(await service.admit(context('job-1'), admissionInput('job-1', '21')), result);
});

void test('[BUA-004, BUA-010] admission returns stable reasons and does not persist rejected work', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  await repository.saveSnapshot(context('snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  assert.deepEqual(
    await service.admit(context('missing'), {
      ...admissionInput('missing', '22'),
      snapshotId: stable('00000000-0000-4000-8000-000000000099'),
    }),
    { accepted: false, code: 'ENTITLEMENT_NOT_FOUND' },
  );
  assert.deepEqual(
    await service.admit(context('feature'), {
      ...admissionInput('feature', '23'),
      feature: 'admin.write',
    }),
    { accepted: false, code: 'FEATURE_NOT_GRANTED' },
  );
  assert.equal((await repository.listUsageState(context('read'))).entries.length, 0);
});

void test('[BUA-012] finalize and release append settlement entries with idempotent retries', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  await repository.saveSnapshot(context('snapshot'), snapshot());
  const service = new EntitlementAdmissionService(repository);
  const admitted = await service.admit(context('job-3'), admissionInput('job-3', '24'));
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  const finalized = await service.finalize(context('finish-3'), {
    reservationId: admitted.value.reservation.reservationId,
    releaseEntryId: stable('00000000-0000-4000-8000-000000000125'),
    commitEntryId: stable('00000000-0000-4000-8000-000000000126'),
    committedUnits: 1,
    now: '2026-01-01T00:02:00.000Z',
    idempotencyKey: 'finish-3',
  });
  assert.equal(finalized.accepted, true);
  if (!finalized.accepted) return;
  assert.equal(finalized.value.entries.length, 3);
  assert.deepEqual(
    await service.finalize(context('finish-3'), {
      reservationId: admitted.value.reservation.reservationId,
      releaseEntryId: stable('00000000-0000-4000-8000-000000000125'),
      commitEntryId: stable('00000000-0000-4000-8000-000000000126'),
      committedUnits: 1,
      now: '2026-01-01T00:02:00.000Z',
      idempotencyKey: 'finish-3',
    }),
    finalized,
  );
});
