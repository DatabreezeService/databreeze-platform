import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptEntitlementLeaseV1,
  createEntitlementLeaseV1,
  createEntitlementSnapshotV1,
  createPlanV1,
} from '../dist/entitlements/v1.js';

const scope = { scopeType: 'organization', organizationId: '00000000-0000-4000-8000-000000000751' };
const signer = {
  sign: (payload) => `sig:${payload}`,
  verify: (payload, signature) => signature === `sig:${payload}`,
};

function snapshot(status = 'ACTIVE') {
  const plan = createPlanV1({
    planCode: 'development',
    displayNameKey: 'plan.development',
    features: ['spreadsheet.audit'],
    quotas: [{ metric: 'job_count', limit: 20 }],
  });
  assert.equal(plan.accepted, true);
  if (!plan.accepted) throw new Error('invalid plan');
  const created = createEntitlementSnapshotV1({
    snapshotId: '00000000-0000-4000-8000-000000000752',
    tenantScope: scope,
    plan: plan.value,
    status,
    revision: 3,
    securityEpoch: 2,
    effectiveAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-02T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid snapshot');
  return created.value;
}

void test('[BUA-001, BUA-017, BUA-018] snapshots are immutable plan projections and leases are signed and bounded', () => {
  const lease = createEntitlementLeaseV1(
    snapshot(),
    {
      leaseId: '00000000-0000-4000-8000-000000000753',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T12:00:00.000Z',
    },
    signer,
  );
  assert.equal(lease.accepted, true);
  if (!lease.accepted) return;
  assert.deepEqual(
    acceptEntitlementLeaseV1(
      lease.value,
      {
        now: '2026-01-01T01:00:00.000Z',
        tenantScope: scope,
        snapshotRevision: 3,
        securityEpoch: 2,
      },
      signer,
    ),
    { accepted: true, value: true },
  );
});

void test('[BUA-017, BUA-018] suspended snapshots and overlong leases fail closed', () => {
  assert.deepEqual(
    createEntitlementLeaseV1(
      snapshot('SUSPENDED'),
      {
        leaseId: '00000000-0000-4000-8000-000000000754',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
      signer,
    ),
    { accepted: false, code: 'ENTITLEMENT_SUSPENDED' },
  );
  assert.deepEqual(
    createEntitlementLeaseV1(
      { ...snapshot(), expiresAt: '2026-01-10T00:00:00.000Z' },
      {
        leaseId: '00000000-0000-4000-8000-000000000755',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-03T00:00:00.000Z',
      },
      signer,
    ),
    { accepted: false, code: 'LEASE_INVALID' },
  );
  assert.deepEqual(
    createEntitlementLeaseV1(
      snapshot(),
      {
        leaseId: '00000000-0000-4000-8000-000000000756',
        issuedAt: '2025-12-31T23:59:59.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
      signer,
    ),
    { accepted: false, code: 'LEASE_INVALID' },
  );
});

void test('[BUA-018] a signing-provider exception fails closed as an invalid lease', () => {
  assert.deepEqual(
    createEntitlementLeaseV1(
      snapshot(),
      {
        leaseId: '00000000-0000-4000-8000-000000000759',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
      {
        sign: () => {
          throw new Error('provider unavailable');
        },
      },
    ),
    { accepted: false, code: 'LEASE_INVALID' },
  );
});

void test('[BUA-018] acceptance rejects payloads that do not canonically bind lease fields', () => {
  const lease = createEntitlementLeaseV1(
    snapshot(),
    {
      leaseId: '00000000-0000-4000-8000-000000000757',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
    },
    signer,
  );
  assert.equal(lease.accepted, true);
  if (!lease.accepted) return;
  assert.deepEqual(
    acceptEntitlementLeaseV1(
      { ...lease.value, payload: `${lease.value.payload} ` },
      {
        now: '2026-01-01T00:15:00.000Z',
        tenantScope: scope,
        snapshotRevision: 3,
        securityEpoch: 2,
      },
      signer,
    ),
    { accepted: false, code: 'LEASE_INVALID' },
  );
});

void test('[BUA-001] snapshots reject malformed plan projections instead of trusting caller fields', () => {
  const plan = createPlanV1({
    planCode: 'development',
    displayNameKey: 'plan.development',
    features: ['job.execute'],
    quotas: [{ metric: 'job_count', limit: 20 }],
  });
  assert.equal(plan.accepted, true);
  if (!plan.accepted) return;
  assert.deepEqual(
    createEntitlementSnapshotV1({
      snapshotId: '00000000-0000-4000-8000-000000000758',
      tenantScope: scope,
      plan: { ...plan.value, quotas: [{ metric: 'unknown', limit: 20 }] },
      status: 'ACTIVE',
      revision: 1,
      securityEpoch: 1,
      effectiveAt: '2026-01-01T00:00:00.000Z',
    }),
    { accepted: false, code: 'INVALID_PLAN' },
  );
});
