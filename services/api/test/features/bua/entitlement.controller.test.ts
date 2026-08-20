import assert from 'node:assert/strict';
import test from 'node:test';

import { EntitlementController } from '../../../src/features/bua/api/entitlement.controller.js';
import { EntitlementProblemError } from '../../../src/features/bua/application/entitlement-problem.error.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000401';
const workspaceId = '00000000-0000-4000-8000-000000000402';
const snapshotId = '00000000-0000-4000-8000-000000000403';
const leaseId = '00000000-0000-4000-8000-000000000404';
const actorId = '00000000-0000-4000-8000-000000000405';
const correlationId = '00000000-0000-4000-8000-000000000406';

function context() {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: 'bua-controller',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function controller(overrides: Record<string, unknown> = {}) {
  const repositoryOverrides =
    typeof overrides['repository'] === 'object' && overrides['repository'] !== null
      ? (overrides['repository'] as Record<string, unknown>)
      : {};
  const leases = {
    issue: () =>
      Promise.resolve({
        accepted: true as const,
        value: { leaseId, signature: 'signed' },
      }),
    verify: () => Promise.resolve({ accepted: true as const, value: true as const }),
    ...overrides,
  };
  const repository = {
    findSnapshot: () => Promise.resolve(undefined),
    findCurrentSnapshot: () => Promise.resolve(undefined),
    listUsageState: () => Promise.resolve({ entries: [], reservations: [] }),
    ...repositoryOverrides,
  };
  const requestContext = { resolve: () => Promise.resolve(context()) };
  return new EntitlementController(repository as never, requestContext, leases as never);
}

void test('[BUA-017, BUA-018] controller exposes lease issue and verification endpoints', async () => {
  const instance = controller();
  assert.deepEqual(
    await instance.issueLease({}, snapshotId, { expiresAt: '2026-01-01T01:00:00.000Z' }),
    { leaseId, signature: 'signed' },
  );
  assert.deepEqual(
    await instance.verifyLease({}, leaseId, { snapshotRevision: 4, securityEpoch: 2 }),
    { valid: true },
  );
});

void test('[BUA-001, BUA-002, BUA-015] summary returns server-authoritative AI credits', async () => {
  const instance = controller({
    repository: {
      findCurrentSnapshot: () =>
        Promise.resolve({
          schemaVersion: 1,
          snapshotId,
          organizationId,
          workspaceId,
          planCode: 'professional-monthly',
          status: 'ACTIVE',
          revision: 2,
          securityEpoch: 1,
          effectiveAt: '2026-08-18T00:00:00.000Z',
          features: [],
          quotas: [{ metric: 'job_count', limit: 100 }],
        }),
      listUsageState: () =>
        Promise.resolve({
          entries: [
            {
              schemaVersion: 1,
              entryId: actorId,
              tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
              metric: 'job_count',
              bucket: 'COMMITTED',
              deltaUnits: 12,
              sequence: 1,
              idempotencyKey: 'summary-entry',
              occurredAt: '2026-08-18T00:00:00.000Z',
            },
          ],
          reservations: [
            {
              reservationId: leaseId,
              tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
              metric: 'job_count',
              reservedUnits: 3,
              status: 'ACTIVE',
              createdAt: '2026-08-18T00:00:00.000Z',
              revision: 1,
            },
          ],
        }),
    },
  });
  assert.deepEqual(await instance.summary({}), {
    schemaVersion: 4,
    snapshot: {
      schemaVersion: 1,
      snapshotId,
      organizationId,
      workspaceId,
      planCode: 'professional-monthly',
      status: 'ACTIVE',
      revision: 2,
      securityEpoch: 1,
      effectiveAt: '2026-08-18T00:00:00.000Z',
      features: [],
      quotas: [{ metric: 'job_count', limit: 100 }],
    },
    aiCredits: { metric: 'job_count', limit: 100, used: 12, reserved: 3, remaining: 85 },
  });
});

void test('[BUA-018] controller maps stale and unavailable lease results', async () => {
  await assert.rejects(
    controller({
      verify: () => Promise.resolve({ accepted: false as const, code: 'LEASE_STALE' as const }),
    }).verifyLease({}, leaseId, { snapshotRevision: 3, securityEpoch: 2 }),
    (error: unknown) =>
      error instanceof EntitlementProblemError && error.code === 'ENTITLEMENT_LEASE_STALE',
  );
  await assert.rejects(
    controller({
      issue: () => Promise.resolve({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    }).issueLease({}, snapshotId, { expiresAt: '2026-01-01T01:00:00.000Z' }),
    (error: unknown) =>
      error instanceof EntitlementProblemError && error.code === 'ENTITLEMENT_UNAVAILABLE',
  );
});

void test('[BUA-018] controller never forwards a caller-controlled verification time', async () => {
  let received: unknown;
  const instance = controller({
    verify: (_context: unknown, input: unknown) => {
      received = input;
      return Promise.resolve({ accepted: true as const, value: true as const });
    },
  });
  await instance.verifyLease({}, leaseId, { snapshotRevision: 4, securityEpoch: 2 });
  assert.deepEqual(received, { leaseId, snapshotRevision: 4, securityEpoch: 2 });
});
