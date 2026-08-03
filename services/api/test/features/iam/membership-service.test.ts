import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import {
  IamMembershipService,
  type IamMembershipClockV1,
  type IamMembershipIdGeneratorV1,
} from '../../../src/features/iam/application/membership.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000161',
  invited: '00000000-0000-4000-8000-000000000162',
  correlation: '00000000-0000-4000-8000-000000000163',
  organization: '00000000-0000-4000-8000-000000000164',
  membership: '00000000-0000-4000-8000-000000000165',
  invitation: '00000000-0000-4000-8000-000000000166',
};
const now = new Date('2026-01-03T00:00:00.000Z');

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid membership service fixture identifier');
  return result.value;
}

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    actorId: stable(ids.principal),
    correlationId: stable(ids.correlation),
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid membership service fixture context');
  return result.value;
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
