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
  type IamTransactionDatabaseClientV1,
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
  readonly firstQueries: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly manyQueries: ReadonlyArray<Readonly<Record<string, unknown>>>;
} {
  const memberships = new Map(rows.map((value) => [value.id, value]));
  const forceUpdateConflict = { value: false };
  const firstQueries: Array<Readonly<Record<string, unknown>>> = [];
  const manyQueries: Array<Readonly<Record<string, unknown>>> = [];
  const matches = (
    candidate: IamMembershipDatabaseRowV1,
    where: Readonly<Record<string, unknown>>,
  ): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR' && Array.isArray(value)) {
        return value.some(
          (alternative) =>
            typeof alternative === 'object' &&
            alternative !== null &&
            matches(candidate, alternative as Readonly<Record<string, unknown>>),
        );
      }
      return candidate[key as keyof IamMembershipDatabaseRowV1] === value;
    });
  const client = {
    membershipIdentity: {
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        firstQueries.push(where);
        return [...memberships.values()].find((candidate) => matches(candidate, where)) ?? null;
      },
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => (
        manyQueries.push(where),
        [...memberships.values()].filter((candidate) => matches(candidate, where))
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
    $transaction: async <TValue>(
      work: (transaction: IamTransactionDatabaseClientV1) => Promise<TValue>,
    ) => {
      const before = new Map(memberships);
      try {
        return await work({ membershipIdentity: client.membershipIdentity });
      } catch (error) {
        memberships.clear();
        for (const [key, value] of before) memberships.set(key, value);
        throw error;
      }
    },
  } as unknown as IamDatabaseClientV1;
  return { client, memberships, forceUpdateConflict, firstQueries, manyQueries };
}

void test('[IAM-009, IAM-019] Prisma IAM membership reads are tenant scoped and hide siblings', async () => {
  const { client, manyQueries } = createDatabase([
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
  assert.ok(
    manyQueries.some(
      (query) =>
        Array.isArray(query['OR']) &&
        query['organizationId'] === organizationId &&
        (query['OR'] as readonly unknown[]).some(
          (candidate) =>
            typeof candidate === 'object' &&
            candidate !== null &&
            (candidate as Record<string, unknown>)['scopeType'] === 'PROJECT',
        ),
    ),
  );
});

void test('[IAM-009, IAM-019] malformed membership rows fail closed without blocking valid reads', async () => {
  const valid = row(id('20'), 'WORKSPACE', workspaceId, 'viewer');
  const malformed = {
    ...row(id('21'), 'WORKSPACE', workspaceId, 'viewer'),
    roleId: 'malformed-role',
  };
  const skipped: string[] = [];
  const repository = new PrismaIamRepositoryAdapter(createDatabase([valid, malformed]).client, {
    onMalformedMembershipRow: (membershipId) => skipped.push(membershipId),
  });

  assert.deepEqual(
    (
      await repository.listMemberships(
        context({ scopeType: 'workspace', organizationId, workspaceId }),
      )
    ).map((membership) => membership.id),
    [valid.id],
  );
  assert.deepEqual(skipped, [malformed.id]);
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

void test('[IAM-004] Prisma IAM membership updates persist cleared invitation lifetime fields', async () => {
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;
  const invitation = {
    ...row(id('25'), 'WORKSPACE', workspaceId, 'viewer'),
    status: 'INVITED',
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
  } satisfies IamMembershipDatabaseRowV1;
  const { client, memberships } = createDatabase([invitation]);
  const repository = new PrismaIamRepositoryAdapter(client);

  await repository.saveMembership(context(workspaceScope, 1), {
    id: stable('25'),
    principalId,
    scope: workspaceScope,
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 2,
  });
  assert.equal(memberships.get(id('25'))?.startsAt, null);
  assert.equal(memberships.get(id('25'))?.expiresAt, null);
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

void test('[IAM-009, IAM-019] Prisma membership mutation lookup includes tenant ancestry', async () => {
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;
  const { client, firstQueries } = createDatabase();
  const repository = new PrismaIamRepositoryAdapter(client);

  await repository.saveMembership(context(workspaceScope), {
    id: stable('23'),
    principalId,
    scope: workspaceScope,
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 1,
  });

  assert.deepEqual(firstQueries, [{ id: stable('23') }]);
});

void test('[IAM-009] Prisma membership writes reject cross-organization identifier collisions', async () => {
  const foreignOrganizationId = id('99');
  const foreign = {
    ...row(id('24'), 'WORKSPACE', workspaceId, 'viewer'),
    organizationId: foreignOrganizationId,
  };
  const { client, memberships } = createDatabase([foreign]);
  const repository = new PrismaIamRepositoryAdapter(client);
  const workspaceScope = { scopeType: 'workspace', organizationId, workspaceId } as const;

  await assert.rejects(
    repository.saveMembership(context(workspaceScope), {
      id: stable('24'),
      principalId,
      scope: workspaceScope,
      roleId: 'operator',
      status: 'ACTIVE',
      revision: 1,
    }),
    /IAM_REVISION_CONFLICT/u,
  );
  assert.equal(memberships.get(id('24'))?.organizationId, foreignOrganizationId);
});
