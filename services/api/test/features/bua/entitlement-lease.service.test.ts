import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlanV1,
  createEntitlementSnapshotV1,
  type EntitlementPlanV1,
  type EntitlementSnapshotV1,
} from '@databreeze/domain/entitlements/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { EntitlementLeaseService } from '../../../src/features/bua/application/entitlement-lease.service.js';
import { InMemoryEntitlementLeaseRepositoryAdapter } from '../../../src/features/bua/adapter/in-memory-entitlement-lease-repository.adapter.js';
import { InMemoryEntitlementRepositoryAdapter } from '../../../src/features/bua/adapter/in-memory-entitlement-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000301';
const workspaceId = '00000000-0000-4000-8000-000000000302';
const snapshotId = '00000000-0000-4000-8000-000000000303';
const leaseId = '00000000-0000-4000-8000-000000000304';
const actorId = '00000000-0000-4000-8000-000000000305';
const correlationId = '00000000-0000-4000-8000-000000000306';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(workspace = workspaceId) {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    idempotencyKey: 'lease-service',
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
  const result = createEntitlementSnapshotV1({
    snapshotId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    plan: plan(),
    status: 'ACTIVE',
    revision: 4,
    securityEpoch: 2,
    effectiveAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid snapshot');
  return result.value;
}

function signer() {
  return {
    sign(payload: string) {
      return `sig:${payload}`;
    },
    verify(payload: string, signature: string) {
      return signature === `sig:${payload}`;
    },
  };
}

async function setup() {
  const entitlementRepository = new InMemoryEntitlementRepositoryAdapter();
  await entitlementRepository.saveSnapshot(context(), snapshot());
  const leaseRepository = new InMemoryEntitlementLeaseRepositoryAdapter();
  const service = new EntitlementLeaseService(
    leaseRepository,
    entitlementRepository,
    signer(),
    () => new Date('2026-01-01T00:05:00.000Z'),
    () => leaseId,
  );
  return { service, leaseRepository };
}

void test('[BUA-017] issues one bounded lease from a visible immutable snapshot', async () => {
  const { service, leaseRepository } = await setup();
  const result = await service.issue(context(), {
    snapshotId,
    expiresAt: '2026-01-01T01:05:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.snapshotRevision, 4);
  assert.equal(
    (await leaseRepository.findLease(context(), stable(leaseId)))?.signature,
    result.value.signature,
  );
});

void test('[BUA-017] rejects a lease for a hidden snapshot without writing it', async () => {
  const { service } = await setup();
  const result = await service.issue(context('00000000-0000-4000-8000-000000000399'), {
    snapshotId,
    expiresAt: '2026-01-01T01:05:00.000Z',
  });
  assert.deepEqual(result, { accepted: false, code: 'ENTITLEMENT_NOT_FOUND' });
});

void test('[BUA-018] verifies signature, scope, revision, epoch, and time through the repository', async () => {
  const { service } = await setup();
  const issued = await service.issue(context(), {
    snapshotId,
    expiresAt: '2026-01-01T01:05:00.000Z',
  });
  assert.equal(issued.accepted, true);
  if (!issued.accepted) return;
  assert.deepEqual(
    await service.verify(context(), {
      leaseId,
      snapshotRevision: 4,
      securityEpoch: 2,
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    await service.verify(context(), {
      leaseId,
      snapshotRevision: 3,
      securityEpoch: 2,
    }),
    { accepted: false, code: 'LEASE_STALE' },
  );
});

void test('[BUA-018] rejects invalid generated IDs and malformed verification timestamps', async () => {
  const entitlementRepository = new InMemoryEntitlementRepositoryAdapter();
  await entitlementRepository.saveSnapshot(context(), snapshot());
  const service = new EntitlementLeaseService(
    new InMemoryEntitlementLeaseRepositoryAdapter(),
    entitlementRepository,
    signer(),
    () => new Date('2026-01-01T00:05:00.000Z'),
    () => 'not-an-id',
  );
  assert.deepEqual(
    await service.issue(context(), { snapshotId, expiresAt: '2026-01-01T01:05:00.000Z' }),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
  assert.deepEqual(
    await new EntitlementLeaseService(
      new InMemoryEntitlementLeaseRepositoryAdapter(),
      entitlementRepository,
      signer(),
      () => new Date('invalid'),
    ).verify(context(), {
      leaseId,
      snapshotRevision: 4,
      securityEpoch: 2,
    }),
    { accepted: false, code: 'INVALID_TIMESTAMP' },
  );
});
