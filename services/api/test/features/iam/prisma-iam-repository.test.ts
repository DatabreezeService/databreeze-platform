/* eslint-disable @typescript-eslint/require-await -- Prisma delegate doubles intentionally mirror async client signatures. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaIamRepositoryAdapter,
  type IamDatabaseClientV1,
  type IamMembershipDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-iam-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const id = (tail: string): string => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const stable = (tail: string): StableIdentifierV1 => {
  const parsed = parseStableIdentifierV1(id(tail));
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
};
const organizationId = stable('1');
const workspaceId = stable('2');
const siblingWorkspaceId = stable('3');
const principalId = stable('4');
const projectId = stable('6');

function context(scope: TenantScopeV1, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId: principalId,
    correlationId: id('5'),
    idempotencyKey: 'membership-update-1',
    authorizationEpoch: 1,
    expectedRevision,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

function row(
  idValue: string,
  scope: 'PROJECT' | 'WORKSPACE' | 'ORGANIZATION',
  workspace: string | null,
  roleId: string,
  project: string | null = null,
): IamMembershipDatabaseRowV1 {
  return {
    id: idValue,
    principalType: 'USER',
    principalId,
    scopeType: scope,
    organizationId,
    workspaceId: workspace,
    projectId: project,
    roleId,
    status: 'ACTIVE',
    startsAt: null,
    expiresAt: null,
    revision: 1,
  };
}

function createDatabase(rows: readonly IamMembershipDatabaseRowV1[] = []): {
  readonly client: IamDatabaseClientV1;
  readonly memberships: Map<string, IamMembershipDatabaseRowV1>;
  readonly forceUpdateConflict: { value: boolean };
} {
  const memberships = new Map(rows.map((value) => [value.id, value]));
  const forceUpdateConflict = { value: false };
  const client = {
    membershipIdentity: {
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        memberships.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...memberships.values()].filter((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof IamMembershipDatabaseRowV1] === value,
          ),
        ),
      create: async ({ data }: { readonly data: IamMembershipDatabaseRowV1 }) => {
        memberships.set(data.id, data);
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: { readonly id: string; readonly revision: number };
        readonly data: Partial<IamMembershipDatabaseRowV1>;
      }) => {
        if (forceUpdateConflict.value) return { count: 0 };
        const current = memberships.get(where.id);
        if (!current || current.revision !== where.revision) return { count: 0 };
        const updated = { ...current, ...data };
        memberships.set(where.id, updated);
        return { count: 1 };
      },
    },
    $transaction: async <TValue>(work: (transaction: IamDatabaseClientV1) => Promise<TValue>) => {
      const before = new Map(memberships);
      try {
        return await work(client);
      } catch (error) {
        memberships.clear();
        for (const [key, value] of before) memberships.set(key, value);
        throw error;
      }
    },
  } as unknown as IamDatabaseClientV1;
  return { client, memberships, forceUpdateConflict };
}

void test('[IAM-009, IAM-019] Prisma IAM membership reads are tenant scoped and hide siblings', async () => {
  const { client } = createDatabase([
    row(id('10'), 'WORKSPACE', workspaceId, 'viewer'),
    row(id('11'), 'WORKSPACE', siblingWorkspaceId, 'owner'),
    row(id('12'), 'ORGANIZATION', null, 'admin'),
  ]);
  const repository = new PrismaIamRepositoryAdapter(client);
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;
  assert.equal((await repository.listMemberships(context(workspaceScope))).length, 2);
  assert.equal(
    (await repository.listMemberships(context({ scopeType: 'organization', organizationId })))
      .length,
    3,
  );
  assert.equal(
    (await repository.findMembership(context(workspaceScope), principalId))?.id,
    stable('10'),
  );
});

void test('[IAM-003, IAM-014] Prisma membership authority chooses the narrowest containing scope', async () => {
  const projectScope = {
    scopeType: 'project',
    organizationId,
    workspaceId,
    projectId,
  } as const;
  const { client } = createDatabase([
    row(id('09'), 'ORGANIZATION', null, 'owner'),
    row(id('10'), 'WORKSPACE', workspaceId, 'viewer'),
    row(id('11'), 'PROJECT', workspaceId, 'operator', projectId),
  ]);
  const repository = new PrismaIamRepositoryAdapter(client);

  assert.equal(
    (await repository.findMembership(context(projectScope), principalId))?.roleId,
    'operator',
  );

  const descendantOnly = createDatabase([row(id('12'), 'WORKSPACE', workspaceId, 'owner')]);
  assert.equal(
    await new PrismaIamRepositoryAdapter(descendantOnly.client).findMembership(
      context({ scopeType: 'organization', organizationId }),
      principalId,
    ),
    undefined,
  );
});

void test('[IAM-009, IAM-019] Prisma IAM writes require narrowing and enforce optimistic revisions', async () => {
  const { client, memberships, forceUpdateConflict } = createDatabase();
  const repository = new PrismaIamRepositoryAdapter(client);
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;
  await assert.rejects(
    repository.saveMembership(context(workspaceScope), {
      id: stable('20'),
      principalId,
      scope: { scopeType: 'organization', organizationId },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    }),
    /IAM_SCOPE_NARROWING_REQUIRED/u,
  );
  await repository.saveMembership(context(workspaceScope), {
    id: stable('21'),
    principalId,
    scope: workspaceScope,
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 1,
  });
  await assert.rejects(
    repository.saveMembership(context(workspaceScope, 1), {
      id: stable('21'),
      principalId,
      scope: workspaceScope,
      roleId: 'operator',
      status: 'ACTIVE',
      revision: 3,
    }),
    /IAM_REVISION_CONFLICT/u,
  );
  assert.equal(memberships.get(id('21'))?.roleId, 'viewer');
  forceUpdateConflict.value = true;
  await assert.rejects(
    repository.saveMembership(context(workspaceScope, 1), {
      id: stable('21'),
      principalId,
      scope: workspaceScope,
      roleId: 'operator',
      status: 'ACTIVE',
      revision: 2,
    }),
    /IAM_REVISION_CONFLICT/u,
  );
  assert.equal(memberships.get(id('21'))?.roleId, 'viewer');
});

void test('[IAM-009] Prisma IAM transaction rollback leaves no staged membership', async () => {
  const { client, memberships } = createDatabase();
  const repository = new PrismaIamRepositoryAdapter(client);
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;
  await assert.rejects(
    repository.withTransaction(context(workspaceScope), async (transaction) => {
      await transaction.saveMembership(context(workspaceScope), {
        id: stable('22'),
        principalId,
        scope: workspaceScope,
        roleId: 'viewer',
        status: 'ACTIVE',
        revision: 1,
      });
      throw new Error('rollback');
    }),
    /rollback/u,
  );
  assert.equal(memberships.size, 0);
});
