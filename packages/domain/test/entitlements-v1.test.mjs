import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptEntitlementLeaseV1,
  createPlanV1,
  evaluateEntitlementV1,
  finalizeUsageV1,
  releaseUsageV1,
  reserveUsageV1,
} from '../dist/entitlements/v1.js';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const scope = { scopeType: 'organization', organizationId: id('1') };
const planInput = {
  planCode: 'development',
  displayNameKey: 'plan.development',
  features: ['artifact.register', 'job.execute'],
  quotas: [{ metric: 'job_count', limit: 2 }],
};
const snapshot = {
  schemaVersion: 1,
  snapshotId: id('2'),
  organizationId: id('1'),
  planCode: 'development',
  status: 'ACTIVE',
  revision: 3,
  securityEpoch: 4,
  effectiveAt: '2026-01-01T00:00:00.000Z',
  features: planInput.features,
  quotas: [{ metric: 'job_count', limit: 2 }],
};

test('[BUA-001, BUA-003, BUA-006] plans are provider-independent and feature checks fail closed', () => {
  const plan = createPlanV1(planInput);
  assert.equal(plan.accepted, true);
  if (plan.accepted) assert.equal(plan.value.providerIndependent, true);
  assert.deepEqual(evaluateEntitlementV1(snapshot, '2026-01-01T00:01:00.000Z', 'job.execute'), {
    accepted: true,
    value: true,
  });
  assert.deepEqual(evaluateEntitlementV1(snapshot, '2026-01-01T00:01:00.000Z', 'admin.billing'), {
    accepted: false,
    code: 'FEATURE_NOT_GRANTED',
  });
});

test('[BUA-008, BUA-009, BUA-013] reservations are idempotent and quota bounded', () => {
  const state = { entries: [], reservations: [] };
  const first = reserveUsageV1(snapshot, state, {
    reservationId: id('10'),
    entryId: id('11'),
    tenantScope: scope,
    metric: 'job_count',
    requestedUnits: 2,
    idempotencyKey: 'job-admission-1',
    now: '2026-01-01T00:01:00.000Z',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const repeated = reserveUsageV1(snapshot, first.value.state, {
    reservationId: id('10'),
    entryId: id('11'),
    tenantScope: scope,
    metric: 'job_count',
    requestedUnits: 2,
    idempotencyKey: 'job-admission-1',
    now: '2026-01-01T00:01:00.000Z',
  });
  assert.equal(repeated.accepted, true);
  if (!repeated.accepted) return;
  assert.equal(repeated.value.state.entries.length, 1);
  assert.deepEqual(
    reserveUsageV1(snapshot, first.value.state, {
      reservationId: id('12'),
      entryId: id('13'),
      tenantScope: scope,
      metric: 'job_count',
      requestedUnits: 1,
      idempotencyKey: 'job-admission-2',
      now: '2026-01-01T00:01:00.000Z',
    }),
    { accepted: false, code: 'QUOTA_EXCEEDED' },
  );
  const released = releaseUsageV1(first.value.state, {
    reservationId: id('10'),
    releaseEntryId: id('14'),
    idempotencyKey: 'job-release-1',
    now: '2026-01-01T00:02:00.000Z',
  });
  assert.equal(released.accepted, true);
  if (released.accepted) assert.equal(released.value.reservations[0].status, 'RELEASED');
});

test('[BUA-010, BUA-011] finalization releases reservation and records committed usage', () => {
  const reserved = reserveUsageV1(
    snapshot,
    { entries: [], reservations: [] },
    {
      reservationId: id('20'),
      entryId: id('21'),
      tenantScope: scope,
      metric: 'job_count',
      requestedUnits: 2,
      idempotencyKey: 'job-admission-20',
      now: '2026-01-01T00:01:00.000Z',
    },
  );
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted) return;
  const finalized = finalizeUsageV1(reserved.value.state, {
    reservationId: id('20'),
    releaseEntryId: id('22'),
    commitEntryId: id('23'),
    committedUnits: 1,
    idempotencyKey: 'job-finalize-20',
    now: '2026-01-01T00:02:00.000Z',
  });
  assert.equal(finalized.accepted, true);
  if (finalized.accepted) {
    assert.equal(finalized.value.reservations[0].status, 'FINALIZED');
    assert.equal(finalized.value.entries[2].bucket, 'COMMITTED');
    assert.equal(finalized.value.entries[2].deltaUnits, 1);
  }
});

test('[BUA-017, BUA-018] offline leases require a valid signature, current epoch, and bounded lifetime', () => {
  const lease = {
    schemaVersion: 1,
    leaseId: id('30'),
    tenantScope: scope,
    snapshotRevision: 3,
    securityEpoch: 4,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-02T00:00:00.000Z',
    payload: 'signed-payload',
    signature: 'signature',
  };
  const verifier = {
    verify: (payload, signature) => payload === 'signed-payload' && signature === 'signature',
  };
  assert.deepEqual(
    acceptEntitlementLeaseV1(
      lease,
      {
        now: '2026-01-01T12:00:00.000Z',
        tenantScope: scope,
        snapshotRevision: 3,
        securityEpoch: 4,
      },
      verifier,
    ),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    acceptEntitlementLeaseV1(
      lease,
      {
        now: '2026-01-01T12:00:00.000Z',
        tenantScope: scope,
        snapshotRevision: 2,
        securityEpoch: 4,
      },
      verifier,
    ),
    { accepted: false, code: 'LEASE_STALE' },
  );
});
