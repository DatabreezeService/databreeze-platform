import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvitationTokenV1, type InvitationTokenV1 } from '@databreeze/domain/invitation/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaIamInvitationRepositoryAdapter,
  type IamInvitationDatabaseClientV1,
  type IamInvitationDatabaseRowV1,
  type IamInvitationMembershipDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-iam-invitation-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  owner: '00000000-0000-4000-8000-000000000331',
  invitee: '00000000-0000-4000-8000-000000000332',
  organization: '00000000-0000-4000-8000-000000000333',
  membership: '00000000-0000-4000-8000-000000000334',
  invitation: '00000000-0000-4000-8000-000000000335',
  correlation: '00000000-0000-4000-8000-000000000336',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid Prisma invitation fixture identifier');
  return parsed.value;
}

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId: ids.organization },
    actorId: ids.owner,
    correlationId: ids.correlation,
    idempotencyKey: 'prisma-invitation-001',
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid Prisma invitation fixture context');
  return parsed.value;
}

function membershipRow(status = 'INVITED'): IamInvitationMembershipDatabaseRowV1 {
  return {
    id: ids.membership,
    principalType: 'USER',
    principalId: ids.invitee,
    scopeType: 'ORGANIZATION',
    organizationId: ids.organization,
    workspaceId: null,
    projectId: null,
    roleId: 'viewer',
    status,
    startsAt: status === 'INVITED' ? new Date('2026-08-03T00:00:00.000Z') : null,
    expiresAt: status === 'INVITED' ? new Date('2026-08-04T00:00:00.000Z') : null,
    revision: status === 'INVITED' ? 1 : 2,
  };
}

function token(): InvitationTokenV1 {
  const created = createInvitationTokenV1({
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
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid Prisma invitation token fixture');
  return created.value;
}

function client(options: { readonly updateCount?: number } = {}) {
  const memberships: IamInvitationMembershipDatabaseRowV1[] = [membershipRow()];
  const invitations: IamInvitationDatabaseRowV1[] = [];
  const calls: Array<{ readonly operation: string; readonly input: unknown }> = [];
  const database: IamInvitationDatabaseClientV1 = {
    membershipIdentity: {
      findUnique: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        calls.push({ operation: 'membership.findUnique', input: where });
        return memberships.find((row) => row.id === where['id']) ?? null;
      },
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        calls.push({ operation: 'membership.findMany', input: where });
        return memberships.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value),
        );
      },
      create: async ({ data }: { readonly data: IamInvitationMembershipDatabaseRowV1 }) => {
        await Promise.resolve();
        memberships.push(data);
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Partial<IamInvitationMembershipDatabaseRowV1>;
      }) => {
        await Promise.resolve();
        const index = memberships.findIndex(
          (row) => row.id === where['id'] && row.revision === where['revision'],
        );
        if (index < 0) return { count: 0 };
        memberships[index] = {
          ...memberships[index],
          ...data,
        } as IamInvitationMembershipDatabaseRowV1;
        return { count: options.updateCount ?? 1 };
      },
    },
    invitationTokenRecord: {
      findUnique: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        calls.push({ operation: 'invitation.findUnique', input: where });
        return (
          invitations.find(
            (row) => row.tokenDigest === where['tokenDigest'] || row.id === where['id'],
          ) ?? null
        );
      },
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        calls.push({ operation: 'invitation.findFirst', input: where });
        return (
          invitations.find(
            (row) => row.membershipId === where['membershipId'] && row.status === where['status'],
          ) ?? null
        );
      },
      create: async ({ data }: { readonly data: IamInvitationDatabaseRowV1 }) => {
        await Promise.resolve();
        invitations.push(data);
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Partial<IamInvitationDatabaseRowV1>;
      }) => {
        await Promise.resolve();
        const index = invitations.findIndex(
          (row) =>
            row.id === where['id'] &&
            row.revision === where['revision'] &&
            row.status === where['status'],
        );
        if (index < 0) return { count: 0 };
        invitations[index] = { ...invitations[index], ...data } as IamInvitationDatabaseRowV1;
        return { count: options.updateCount ?? 1 };
      },
    },
    $transaction: async <TValue>(work: (transaction: typeof database) => Promise<TValue>) => {
      await Promise.resolve();
      return work(database);
    },
  };
  return { database, memberships, invitations, calls };
}

void test('[IAM-010] Prisma invitation adapter stores and resolves only exact scoped digests', async () => {
  const fixture = client();
  const repository = new PrismaIamInvitationRepositoryAdapter(fixture.database);
  await repository.withTransaction(context(), async (transaction) => {
    const membership = await transaction.findMembershipById(context(), stable(ids.membership));
    assert.equal(membership?.status, 'INVITED');
    const created = token();
    await transaction.saveInvitation(context(), created);
    assert.equal(
      (await transaction.findInvitationByDigest(context(), created.tokenDigest))?.id,
      stable(ids.invitation),
    );
    assert.equal(
      (await transaction.findActiveInvitationForMembership(context(), stable(ids.membership)))?.id,
      stable(ids.invitation),
    );
  });
  assert.equal(fixture.invitations[0]?.tokenDigest, 'a'.repeat(64));
  assert.equal(fixture.invitations[0]?.emailDigest, 'b'.repeat(64));
  assert.equal(fixture.invitations[0]?.status, 'ACTIVE');
});

void test('[IAM-010] Prisma invitation adapter rejects stale token updates and hides sibling scopes', async () => {
  const fixture = client();
  const repository = new PrismaIamInvitationRepositoryAdapter(fixture.database);
  await repository.withTransaction(context(), async (transaction) => {
    await transaction.saveInvitation(context(), token());
    await assert.rejects(
      transaction.saveInvitation(context(), { ...token(), status: 'REDEEMED', revision: 3 }),
      /IAM_INVITATION_REVISION_CONFLICT/,
    );
    const siblingContext = createIamTenantContextV1({
      tenantScope: {
        scopeType: 'organization',
        organizationId: '00000000-0000-4000-8000-000000000399',
      },
      actorId: ids.owner,
      correlationId: ids.correlation,
      idempotencyKey: 'prisma-invitation-sibling',
      authorizationEpoch: 1,
    });
    assert.equal(siblingContext.accepted, true);
    if (!siblingContext.accepted) return;
    assert.equal(
      await transaction.findInvitationByDigest(siblingContext.value, 'a'.repeat(64)),
      undefined,
    );
  });
});

void test('[IAM-010] Prisma invitation adapter maps a conditional update race to a conflict', async () => {
  const fixture = client({ updateCount: 0 });
  const repository = new PrismaIamInvitationRepositoryAdapter(fixture.database);
  await repository.withTransaction(context(), async (transaction) => {
    await transaction.saveInvitation(context(), token());
    await assert.rejects(
      transaction.saveInvitation(context(), { ...token(), status: 'REDEEMED', revision: 2 }),
      /IAM_INVITATION_REVISION_CONFLICT/,
    );
  });
});
