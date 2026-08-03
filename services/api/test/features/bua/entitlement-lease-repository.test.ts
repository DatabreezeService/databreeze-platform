import assert from 'node:assert/strict';
import test from 'node:test';

import { createEntitlementLeaseV1, createEntitlementSnapshotV1, createPlanV1 } from '@databreeze/domain/entitlements/v1';
import { InMemoryEntitlementLeaseRepositoryAdapter } from '../../../src/features/bua/adapter/in-memory-entitlement-lease-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000761';
const leaseId = '00000000-0000-4000-8000-000000000762';
const actorId = '00000000-0000-4000-8000-000000000763';

function context(scope = { scopeType: 'organization', organizationId }) {
  const result = createIamTenantContextV1({
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000764',
    tenantScope: scope,
    idempotencyKey: 'lease-repository',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function lease() {
  const plan = createPlanV1({ planCode: 'free', displayNameKey: 'plan.free', features: [], quotas: [{ metric: 'job_count', limit: 1 }] });
  assert.equal(plan.accepted, true);
  if (!plan.accepted) throw new Error('invalid plan');
  const snapshot = createEntitlementSnapshotV1({ snapshotId: '00000000-0000-4000-8000-000000000765', tenantScope: { scopeType: 'organization', organizationId }, plan: plan.value, status: 'ACTIVE', revision: 1, securityEpoch: 1, effectiveAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) throw new Error('invalid snapshot');
  const issued = createEntitlementLeaseV1(snapshot.value, { leaseId, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T01:00:00.000Z' }, { sign: (payload) => payload });
  assert.equal(issued.accepted, true);
  if (!issued.accepted) throw new Error('invalid lease');
  return issued.value;
}

void test('[BUA-017, BUA-018] in-memory lease persistence is immutable and scoped', async () => {
  const repository = new InMemoryEntitlementLeaseRepositoryAdapter();
  await repository.saveLease(context(), lease());
  assert.equal((await repository.findLease(context(), lease().leaseId))?.leaseId, leaseId);
  assert.equal(await repository.findLease(context({ scopeType: 'organization', organizationId: '00000000-0000-4000-8000-000000000799' }), lease().leaseId), undefined);
  await assert.rejects(repository.saveLease(context(), { ...lease(), signature: 'changed' }), /BUA_IMMUTABLE_LEASE/u);
});
