import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvitationTokenV1 } from '@databreeze/domain/invitation/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamInvitationRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-invitation-repository.adapter.js';
import type { IamMembershipRecordV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import type {
  IamInvitationRepositoryPortV1,
  IamInvitationTransactionPortV1,
} from '../../../src/features/iam/application/invitation-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  owner: '00000000-0000-4000-8000-000000000321',
  invitee: '00000000-0000-4000-8000-000000000322',
  organization: '00000000-0000-4000-8000-000000000323',
  membership: '00000000-0000-4000-8000-000000000324',
  invitation: '00000000-0000-4000-8000-000000000325',
  correlation: '00000000-0000-4000-8000-000000000326',
};

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid repository fixture identifier');
  return result.value;
}

function timestamp(value: string) {
  const result = parseStrictUtcTimestampV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid repository fixture timestamp');
  return result.value;
}

function context(
  actorId = ids.owner,
  scope: unknown = { scopeType: 'organization', organizationId: ids.organization },
) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId,
    correlationId: ids.correlation,
    idempotencyKey: `invitation-repository-${actorId}`,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid repository fixture context');
  return result.value;
}

function membership(status: IamMembershipRecordV1['status'] = 'INVITED'): IamMembershipRecordV1 {
  return {
    id: stable(ids.membership),
    principalId: stable(ids.invitee),
    scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    roleId: 'viewer',
    status,
    ...(status === 'INVITED'
      ? {
          startsAt: timestamp('2026-08-03T00:00:00.000Z'),
          expiresAt: timestamp('2026-08-04T00:00:00.000Z'),
        }
      : {}),
    revision: 1,
  };
}

function invitation() {
  const result = createInvitationTokenV1({
    id: ids.invitation,
    membershipId: ids.membership,
    principalId: ids.invitee,
    scope: { scopeType: 'organization', organizationId: ids.organization },
    roleId: 'viewer',
    tokenDigest: 'a'.repeat(64),
    emailDigest: 'b'.repeat(64),
    issuedAt: '2026-08-03T00:00:00.000Z',
    expiresAt: '2026-08-10T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid repository fixture invitation');
  return result.value;
}

void test('[IAM-010] in-memory invitation repository scopes digest and membership lookups', async () => {
  const repository: IamInvitationRepositoryPortV1 = new InMemoryIamInvitationRepositoryAdapter([
    membership(),
  ]);
  await repository.withTransaction(
    context(),
    async (transaction: IamInvitationTransactionPortV1) => {
      await transaction.saveInvitation(context(), invitation());
      assert.equal(
        (await transaction.findInvitationByDigest(context(), 'a'.repeat(64)))?.id,
        stable(ids.invitation),
      );
      assert.equal(
        await transaction.findInvitationByDigest(
          context(ids.owner, {
            scopeType: 'workspace',
            organizationId: ids.organization,
            workspaceId: '00000000-0000-4000-8000-000000000399',
          }),
          'a'.repeat(64),
        ),
        undefined,
      );
    },
  );
});

void test('[IAM-010] invitation repository enforces immutable identity and compare-and-set revisions', async () => {
  const repository: IamInvitationRepositoryPortV1 = new InMemoryIamInvitationRepositoryAdapter([
    membership(),
  ]);
  await repository.withTransaction(
    context(),
    async (transaction: IamInvitationTransactionPortV1) => {
      await transaction.saveInvitation(context(), invitation());
      await assert.rejects(
        transaction.saveInvitation(context(), { ...invitation(), roleId: 'admin' }),
        /IAM_INVITATION_SCOPE_IMMUTABLE/,
      );
      await assert.rejects(
        transaction.saveMembership(context(), { ...membership('ACTIVE'), revision: 3 }),
        /IAM_REVISION_CONFLICT/,
      );
    },
  );
});

void test('[IAM-010] invitation repository transaction rolls back token and membership together', async () => {
  const repository: IamInvitationRepositoryPortV1 = new InMemoryIamInvitationRepositoryAdapter([
    membership(),
  ]);
  await assert.rejects(
    repository.withTransaction(context(), async (transaction: IamInvitationTransactionPortV1) => {
      await transaction.saveInvitation(context(), invitation());
      const next = { ...membership('ACTIVE'), revision: 2 };
      await transaction.saveMembership(context(), next);
      throw new Error('simulated delivery acknowledgement failure');
    }),
    /simulated delivery acknowledgement failure/,
  );
  await repository.withTransaction(
    context(),
    async (transaction: IamInvitationTransactionPortV1) => {
      assert.equal(await transaction.findInvitationByDigest(context(), 'a'.repeat(64)), undefined);
      assert.equal(
        (await transaction.findMembershipById(context(), stable(ids.membership)))?.status,
        'INVITED',
      );
    },
  );
});
