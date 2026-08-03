/* eslint-disable @typescript-eslint/require-await -- repository doubles mirror async ports. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { INVITATION_MAX_SECONDS_V1 } from '@databreeze/domain/identity/v1';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import {
  IamMembershipService,
  type IamMembershipClockV1,
  type IamMembershipIdGeneratorV1,
} from '../../../src/features/iam/application/membership.service.js';
import type { IamRepositoryPortV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000161',
  invited: '00000000-0000-4000-8000-000000000162',
  outsider: '00000000-0000-4000-8000-000000000167',
  successor: '00000000-0000-4000-8000-000000000168',
  correlation: '00000000-0000-4000-8000-000000000163',
  organization: '00000000-0000-4000-8000-000000000164',
  membership: '00000000-0000-4000-8000-000000000165',
  invitation: '00000000-0000-4000-8000-000000000166',
  successorMembership: '00000000-0000-4000-8000-000000000169',
};
const now = new Date('2026-01-03T00:00:00.000Z');

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid membership service fixture identifier');
  return result.value;
}

function contextFor(actorId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    actorId: stable(actorId),
    correlationId: stable(ids.correlation),
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid membership service fixture context');
  return result.value;
}

function context(idempotencyKey: string) {
  return contextFor(ids.principal, idempotencyKey);
}

function idsFrom(...values: string[]): IamMembershipIdGeneratorV1 {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (!next) throw new Error('membership id generator exhausted');
    return next;
  };
}

const clock: IamMembershipClockV1 = () => now;

function repository(roleId: 'owner' | 'admin' | 'viewer' = 'owner') {
  const value = new InMemoryIamRepositoryAdapter();
  value.seed([
    {
      id: stable(ids.membership),
      principalId: stable(ids.principal),
      scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
      roleId,
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  return value;
}

void test('[IAM-004] owner can create a server-identified, expiring invitation in scope', async () => {
  const value = repository();
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  const result = await service.invite(context('membership-service-001'), {
    principalId: ids.invited,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.id, stable(ids.invitation));
  assert.equal(result.value.principalId, stable(ids.invited));
  assert.equal(result.value.status, 'INVITED');
  assert.equal(result.value.revision, 1);
  assert.equal(result.value.scope.scopeType, 'organization');
});

void test('[IAM-003, IAM-004] viewer and out-of-scope invitations are denied', async () => {
  const viewer = repository('viewer');
  const service = new IamMembershipService(viewer, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await service.invite(context('membership-service-002'), {
      principalId: ids.invited,
      scope: { scopeType: 'organization', organizationId: ids.organization },
      roleId: 'viewer',
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  const owner = repository();
  const ownerService = new IamMembershipService(owner, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await ownerService.invite(context('membership-service-003'), {
      principalId: ids.invited,
      scope: {
        scopeType: 'organization',
        organizationId: '00000000-0000-4000-8000-000000000199',
      },
      roleId: 'viewer',
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
});

void test('[IAM-004] membership administration listing requires a settings-management permission', async () => {
  const viewer = repository('viewer');
  const service = new IamMembershipService(viewer, idsFrom(ids.invitation), clock);
  assert.deepEqual(await service.list(context('membership-service-list-001')), {
    accepted: false,
    code: 'SCOPE_DENIED',
  });
});

void test('[IAM-004] membership listing maps authority outages to a stable availability code', async () => {
  const base = repository();
  const unavailable: IamRepositoryPortV1 = {
    findMembership: async () => {
      throw new Error('membership store unavailable');
    },
    listMemberships: async () => {
      throw new Error('membership store unavailable');
    },
    saveMembership: base.saveMembership.bind(base),
    withTransaction: base.withTransaction.bind(base),
  };
  const service = new IamMembershipService(unavailable, idsFrom(ids.invitation), clock);
  assert.deepEqual(await service.list(context('membership-service-list-002')), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

void test('[IAM-004] owner invitations are organization-only and cannot be delegated by an admin', async () => {
  const admin = repository('admin');
  const adminService = new IamMembershipService(admin, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await adminService.invite(context('membership-service-owner-role-001'), {
      principalId: ids.invited,
      scope: { scopeType: 'organization', organizationId: ids.organization },
      roleId: 'owner',
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  const owner = repository();
  const ownerService = new IamMembershipService(owner, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await ownerService.invite(context('membership-service-owner-role-002'), {
      principalId: ids.invited,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: '00000000-0000-4000-8000-000000000170',
      },
      roleId: 'owner',
    }),
    { accepted: false, code: 'INVALID_STATE' },
  );
});

void test('[IAM-004] status transitions enforce revisions and cannot remove the last owner', async () => {
  const value = repository();
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await service.transition(context('membership-service-004'), ids.membership, 1, 'REMOVED'),
    { accepted: false, code: 'LAST_OWNER' },
  );
  assert.deepEqual(
    await service.transition(context('membership-service-005'), ids.membership, 2, 'SUSPENDED'),
    { accepted: false, code: 'CONFLICT' },
  );
});

void test('[IAM-004] an admin cannot remove an owner even when another owner exists', async () => {
  const value = repository('admin');
  await value.saveMembership(context('membership-service-admin-owner-001'), {
    id: stable(ids.successorMembership),
    principalId: stable(ids.successor),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'owner',
    status: 'ACTIVE',
    revision: 1,
  });
  await value.saveMembership(context('membership-service-admin-owner-003'), {
    id: stable(ids.invitation),
    principalId: stable(ids.invited),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'owner',
    status: 'ACTIVE',
    revision: 1,
  });
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await service.transition(
      context('membership-service-admin-owner-002'),
      ids.successorMembership,
      1,
      'REMOVED',
    ),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
});

void test('[IAM-004] invitee can accept an unexpired invitation and invitation lifetime is cleared', async () => {
  const value = repository();
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  const invited = await service.invite(context('membership-service-006'), {
    principalId: ids.invited,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
  });
  assert.equal(invited.accepted, true);
  if (!invited.accepted) return;

  const accepted = await service.accept(
    contextFor(ids.invited, 'membership-service-007'),
    invited.value.id,
    invited.value.revision,
  );
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(accepted.value.status, 'ACTIVE');
  assert.equal(accepted.value.revision, 2);
  assert.equal(accepted.value.startsAt, undefined);
  assert.equal(accepted.value.expiresAt, undefined);
  assert.deepEqual(
    (await value.listMemberships(context('membership-service-008'))).find(
      (membership) => membership.id === invited.value.id,
    ),
    accepted.value,
  );
});

void test('[IAM-004] administrators cannot activate invitations outside the accept flow', async () => {
  const value = repository();
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  const invitation = await service.invite(context('membership-service-006b'), {
    principalId: ids.invited,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
  });
  assert.equal(invitation.accepted, true);
  if (!invitation.accepted) return;
  assert.deepEqual(
    await service.transition(context('membership-service-006c'), invitation.value.id, 1, 'ACTIVE'),
    { accepted: false, code: 'CONFLICT' },
  );
  assert.equal(
    (await value.listMemberships(context('membership-service-006d'))).find(
      (membership) => membership.id === invitation.value.id,
    )?.status,
    'INVITED',
  );
});

void test('[IAM-004] invitation acceptance fails closed for an outsider, expiry, and stale revisions', async () => {
  const value = repository();
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  const invited = await service.invite(context('membership-service-009'), {
    principalId: ids.invited,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
  });
  assert.equal(invited.accepted, true);
  if (!invited.accepted) return;
  assert.deepEqual(
    await service.accept(contextFor(ids.outsider, 'membership-service-010'), invited.value.id, 1),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  assert.deepEqual(
    await service.accept(contextFor(ids.invited, 'membership-service-011'), invited.value.id, 2),
    { accepted: false, code: 'CONFLICT' },
  );

  const expiredClock: IamMembershipClockV1 = () =>
    new Date(Date.parse(now.toISOString()) + INVITATION_MAX_SECONDS_V1 * 1_000);
  const expiringValue = repository();
  const expiring = new IamMembershipService(expiringValue, idsFrom(ids.invitation), clock);
  const invitation = await expiring.invite(context('membership-service-012'), {
    principalId: ids.invited,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
  });
  assert.equal(invitation.accepted, true);
  if (!invitation.accepted) return;
  const expired = new IamMembershipService(expiringValue, idsFrom(), expiredClock);
  assert.deepEqual(
    await expired.accept(contextFor(ids.invited, 'membership-service-013'), invitation.value.id, 1),
    { accepted: false, code: 'EXPIRED' },
  );
});

void test('[IAM-004] owner transfer atomically promotes an active organization member', async () => {
  const value = repository();
  await value.saveMembership(context('membership-service-014'), {
    id: stable(ids.successorMembership),
    principalId: stable(ids.successor),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'admin',
    status: 'ACTIVE',
    revision: 4,
  });
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  const transferred = await service.transferOwnership(
    context('membership-service-015'),
    ids.successorMembership,
    4,
  );
  assert.equal(transferred.accepted, true);
  if (!transferred.accepted) return;
  assert.equal(transferred.value.id, stable(ids.successorMembership));
  assert.equal(transferred.value.roleId, 'owner');
  assert.equal(transferred.value.revision, 5);
  assert.equal(
    (await value.findMembership(context('membership-service-016'), stable(ids.principal)))?.roleId,
    'admin',
  );
  assert.equal(
    (
      await value.findMembership(
        contextFor(ids.successor, 'membership-service-017'),
        stable(ids.successor),
      )
    )?.roleId,
    'owner',
  );
});

void test('[IAM-004] owner transfer requires an owner and rolls back when target revision is stale', async () => {
  const value = repository();
  await value.saveMembership(context('membership-service-018'), {
    id: stable(ids.successorMembership),
    principalId: stable(ids.successor),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'admin',
    status: 'ACTIVE',
    revision: 1,
  });
  const service = new IamMembershipService(value, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await service.transferOwnership(
      contextFor(ids.outsider, 'membership-service-019'),
      ids.successorMembership,
      1,
    ),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  assert.deepEqual(
    await service.transferOwnership(context('membership-service-020'), ids.successorMembership, 2),
    { accepted: false, code: 'CONFLICT' },
  );
  assert.equal(
    (await value.findMembership(context('membership-service-021'), stable(ids.principal)))?.roleId,
    'owner',
  );
  assert.equal(
    (
      await value.findMembership(
        contextFor(ids.successor, 'membership-service-022'),
        stable(ids.successor),
      )
    )?.roleId,
    'admin',
  );
});

void test('[IAM-004] owner transfer rolls back when the second optimistic write fails', async () => {
  const base = repository();
  await base.saveMembership(context('membership-service-transfer-rollback-001'), {
    id: stable(ids.successorMembership),
    principalId: stable(ids.successor),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'admin',
    status: 'ACTIVE',
    revision: 1,
  });
  let writes = 0;
  const failing: IamRepositoryPortV1 = {
    findMembership: base.findMembership.bind(base),
    listMemberships: base.listMemberships.bind(base),
    saveMembership: base.saveMembership.bind(base),
    withTransaction: (requestContext, work) =>
      base.withTransaction(requestContext, (transaction) =>
        work({
          findMembership: transaction.findMembership.bind(transaction),
          listMemberships: transaction.listMemberships.bind(transaction),
          saveMembership: async (mutationContext, membership) => {
            writes += 1;
            if (writes === 2) throw new Error('target write failed');
            return transaction.saveMembership(mutationContext, membership);
          },
        }),
      ),
  };
  const service = new IamMembershipService(failing, idsFrom(ids.invitation), clock);
  assert.deepEqual(
    await service.transferOwnership(
      context('membership-service-transfer-rollback-002'),
      ids.successorMembership,
      1,
    ),
    { accepted: false, code: 'UNAVAILABLE' },
  );
  assert.equal(
    (
      await base.findMembership(
        context('membership-service-transfer-rollback-003'),
        stable(ids.principal),
      )
    )?.roleId,
    'owner',
  );
  assert.equal(
    (
      await base.findMembership(
        contextFor(ids.successor, 'membership-service-transfer-rollback-004'),
        stable(ids.successor),
      )
    )?.roleId,
    'admin',
  );
});
