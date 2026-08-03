import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlanV1,
  reserveUsageV1,
  type EntitlementPlanV1,
  type EntitlementSnapshotV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryEntitlementRepositoryAdapter } from '../../../src/features/bua/adapter/in-memory-entitlement-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid stable identifier');
  return parsed.value;
}

function context(scopeWorkspace: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: scopeWorkspace },
    actorId,
    correlationId,
    idempotencyKey: `entitlement-${scopeWorkspace}`,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid entitlement context');
  return result.value;
}

function organizationContext() {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId },
    actorId,
    correlationId,
    idempotencyKey: 'entitlement-organization',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid organization context');
  return result.value;
}

function plan(): EntitlementPlanV1 {
  const result = createPlanV1({
    planCode: 'development',
    displayNameKey: 'plan.development',
    features: ['artifact.register', 'job.execute'],
    quotas: [{ metric: 'job_count', limit: 3 }],
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
    effectiveAt: '2026-01-01T00:00:00.000Z' as EntitlementSnapshotV1['effectiveAt'],
    features: ['artifact.register', 'job.execute'],
    quotas: [{ metric: 'job_count', limit: 3 }],
  };
}

void test('[BUA-001, BUA-002, BUA-003] plans and snapshots are immutable and scope-isolated', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  await repository.savePlan(plan());
  assert.deepEqual(await repository.findPlan('development'), plan());
  const reorderedPlan = {
    ...plan(),
    features: ['job.execute', 'artifact.register'],
  };
  await repository.savePlan({
    ...reorderedPlan,
  });
  assert.deepEqual(await repository.findPlan('development'), reorderedPlan);
  await repository.saveSnapshot(context(workspaceId), snapshot());
  await repository.saveSnapshot(context(workspaceId), {
    ...snapshot(),
    features: ['job.execute', 'artifact.register'],
  });
  assert.equal(
    (
      await repository.findSnapshot(
        context(workspaceId),
        stable('00000000-0000-4000-8000-000000000020'),
      )
    )?.revision,
    1,
  );
  assert.equal(
    await repository.findSnapshot(
      context(siblingWorkspaceId),
      stable('00000000-0000-4000-8000-000000000020'),
    ),
    undefined,
  );
  await assert.rejects(
    repository.saveSnapshot(context(workspaceId), { ...snapshot(), revision: 2 }),
    /BUA_IMMUTABLE_SNAPSHOT/,
  );
});

void test('[BUA-008, BUA-009, BUA-010, BUA-011] usage state persists append-only entries and status revisions', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  const storedSnapshot = snapshot();
  const reserved = reserveUsageV1(
    storedSnapshot,
    { entries: [], reservations: [] },
    {
      reservationId: stable('00000000-0000-4000-8000-000000000030'),
      entryId: stable('00000000-0000-4000-8000-000000000031'),
      tenantScope: {
        scopeType: 'workspace',
        organizationId: stable(organizationId),
        workspaceId: stable(workspaceId),
      },
      metric: 'job_count',
      requestedUnits: 2,
      idempotencyKey: 'job-1',
      now: '2026-01-01T00:01:00.000Z',
    },
  );
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted) return;
  await repository.persistUsageState(context(workspaceId), reserved.value.state);
  assert.equal((await repository.listUsageState(context(workspaceId))).entries.length, 1);
  await assert.rejects(
    repository.persistUsageState(context(siblingWorkspaceId), reserved.value.state),
    /BUA_SCOPE_NARROWING_REQUIRED/u,
  );
  const activeReservation = reserved.value.state.reservations[0];
  if (!activeReservation) throw new Error('fixture reservation missing');
  await assert.rejects(
    repository.persistUsageState(context(workspaceId), {
      entries: reserved.value.state.entries,
      reservations: [{ ...activeReservation, revision: 2 }],
    }),
    /BUA_RESERVATION_CONFLICT/,
  );
  await assert.rejects(
    repository.persistUsageState(context(workspaceId), {
      ...reserved.value.state,
      entries: reserved.value.state.entries.map((entry) => ({ ...entry, deltaUnits: 9 })),
    }),
    /BUA_IMMUTABLE_USAGE_ENTRY/,
  );
  const persistedEntry = reserved.value.state.entries[0];
  if (!persistedEntry) throw new Error('fixture entry missing');
  await assert.rejects(
    repository.persistUsageState(context(workspaceId), {
      ...reserved.value.state,
      entries: [persistedEntry, persistedEntry],
    }),
    /BUA_USAGE_STATE_CONFLICT/u,
  );
  if (!activeReservation) throw new Error('fixture reservation missing');
  await assert.rejects(
    repository.persistUsageState(context(workspaceId), {
      ...reserved.value.state,
      reservations: [activeReservation, activeReservation],
    }),
    /BUA_USAGE_STATE_CONFLICT/u,
  );
  await assert.rejects(
    repository.withTransaction(context(workspaceId), async (transaction) => {
      const second = reserveUsageV1(storedSnapshot, reserved.value.state, {
        reservationId: stable('00000000-0000-4000-8000-000000000032'),
        entryId: stable('00000000-0000-4000-8000-000000000033'),
        tenantScope: {
          scopeType: 'workspace',
          organizationId: stable(organizationId),
          workspaceId: stable(workspaceId),
        },
        metric: 'job_count',
        requestedUnits: 1,
        idempotencyKey: 'job-2',
        now: '2026-01-01T00:02:00.000Z',
      });
      assert.equal(second.accepted, true);
      if (!second.accepted) return;
      await transaction.persistUsageState(context(workspaceId), {
        ...second.value.state,
      });
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal((await repository.listUsageState(context(workspaceId))).entries.length, 1);
});

void test('[IAM-009, BUA-008] replaying inherited organization usage through a workspace context is read-only', async () => {
  const repository = new InMemoryEntitlementRepositoryAdapter();
  const { workspaceId: organizationWorkspaceId, ...organizationSnapshot } = snapshot();
  void organizationWorkspaceId;
  const storedSnapshot = {
    ...organizationSnapshot,
    snapshotId: stable('00000000-0000-4000-8000-000000000040'),
  };
  await repository.saveSnapshot(organizationContext(), storedSnapshot);
  const reserved = reserveUsageV1(
    storedSnapshot,
    { entries: [], reservations: [] },
    {
      reservationId: stable('00000000-0000-4000-8000-000000000041'),
      entryId: stable('00000000-0000-4000-8000-000000000042'),
      tenantScope: { scopeType: 'organization', organizationId: stable(organizationId) },
      metric: 'job_count',
      requestedUnits: 1,
      idempotencyKey: 'organization-job',
      now: '2026-01-01T00:01:00.000Z',
    },
  );
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted) return;
  await repository.persistUsageState(organizationContext(), reserved.value.state);
  const inherited = await repository.listUsageState(context(workspaceId));
  assert.equal(inherited.entries.length, 1);
  await repository.persistUsageState(context(workspaceId), inherited);
  assert.equal((await repository.listUsageState(organizationContext())).entries.length, 1);
});
