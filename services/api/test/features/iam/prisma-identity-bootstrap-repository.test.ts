/* eslint-disable @typescript-eslint/require-await -- Prisma delegate doubles intentionally mirror async client signatures. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapPersonalOrganizationV1 } from '@databreeze/domain/identity/v1';

import {
  PrismaIdentityBootstrapRepositoryAdapter,
  type IdentityBootstrapDatabaseClientV1,
  type UserIdentityDatabaseRowV1,
  type OrganizationIdentityDatabaseRowV1,
  type WorkspaceIdentityDatabaseRowV1,
  type ProjectIdentityDatabaseRowV1,
  type MembershipIdentityDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-identity-bootstrap-repository.adapter.js';

const userId = '00000000-0000-4000-8000-000000000001';
const organizationId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const projectId = '00000000-0000-4000-8000-000000000004';
const membershipId = '00000000-0000-4000-8000-000000000005';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const input = {
  user: {
    id: userId,
    displayName: 'Nguyen An',
    createdAt: createdAt.toISOString(),
  },
  organizationId,
  workspaceId,
  projectId,
  membershipId,
  createdAt: createdAt.toISOString(),
};

function createDatabase(): {
  readonly client: IdentityBootstrapDatabaseClientV1;
  readonly users: Map<string, UserIdentityDatabaseRowV1>;
  readonly organizations: Map<string, OrganizationIdentityDatabaseRowV1>;
  readonly workspaces: Map<string, WorkspaceIdentityDatabaseRowV1>;
  readonly projects: Map<string, ProjectIdentityDatabaseRowV1>;
  readonly memberships: Map<string, MembershipIdentityDatabaseRowV1>;
  readonly transactionCalls: { value: number };
  readonly transactionWriteCalls: { value: number };
  readonly organizationFindManyCalls: { value: number };
} {
  const users = new Map<string, UserIdentityDatabaseRowV1>([
    [
      userId,
      {
        id: userId,
        email: 'an@example.com',
        displayName: 'Nguyen An',
        locale: 'vi-VN',
        status: 'ACTIVE',
        securityEpoch: 1,
        createdAt,
      },
    ],
  ]);
  const organizations = new Map<string, OrganizationIdentityDatabaseRowV1>();
  const workspaces = new Map<string, WorkspaceIdentityDatabaseRowV1>();
  const projects = new Map<string, ProjectIdentityDatabaseRowV1>();
  const memberships = new Map<string, MembershipIdentityDatabaseRowV1>();
  const transactionCalls = { value: 0 };
  const transactionWriteCalls = { value: 0 };
  const organizationFindManyCalls = { value: 0 };
  const client = {
    userIdentity: {
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        users.get(where.id) ?? null,
    },
    organizationIdentity: {
      create: async ({ data }: { readonly data: OrganizationIdentityDatabaseRowV1 }) => {
        organizations.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        organizations.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        organizationFindManyCalls.value += 1;
        const ids =
          typeof where['id'] === 'object' && where['id'] !== null && 'in' in where['id']
            ? ((where['id'] as { readonly in?: readonly string[] }).in ?? [])
            : [];
        return [...organizations.values()].filter(
          (row) => ids.includes(row.id) && where['personal'] === row.personal,
        );
      },
    },
    workspaceIdentity: {
      create: async ({ data }: { readonly data: WorkspaceIdentityDatabaseRowV1 }) => {
        workspaces.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        workspaces.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...workspaces.values()].filter((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof WorkspaceIdentityDatabaseRowV1] === value,
          ),
        ),
    },
    projectIdentity: {
      create: async ({ data }: { readonly data: ProjectIdentityDatabaseRowV1 }) => {
        projects.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        projects.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...projects.values()].filter((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof ProjectIdentityDatabaseRowV1] === value,
          ),
        ),
    },
    membershipIdentity: {
      create: async ({ data }: { readonly data: MembershipIdentityDatabaseRowV1 }) => {
        memberships.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        memberships.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...memberships.values()].filter((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof MembershipIdentityDatabaseRowV1] === value,
          ),
        ),
    },
    $transaction: async <TValue>(
      work: (transaction: IdentityBootstrapDatabaseClientV1) => Promise<TValue>,
    ) => {
      transactionCalls.value += 1;
      const before = {
        organizations: new Map(organizations),
        workspaces: new Map(workspaces),
        projects: new Map(projects),
        memberships: new Map(memberships),
      };
      const transaction = {
        ...client,
        organizationIdentity: {
          ...client.organizationIdentity,
          create: async (input: { readonly data: OrganizationIdentityDatabaseRowV1 }) => {
            transactionWriteCalls.value += 1;
            return client.organizationIdentity.create(input);
          },
        },
        workspaceIdentity: {
          ...client.workspaceIdentity,
          create: async (input: { readonly data: WorkspaceIdentityDatabaseRowV1 }) => {
            transactionWriteCalls.value += 1;
            return client.workspaceIdentity.create(input);
          },
        },
        projectIdentity: {
          ...client.projectIdentity,
          create: async (input: { readonly data: ProjectIdentityDatabaseRowV1 }) => {
            transactionWriteCalls.value += 1;
            return client.projectIdentity.create(input);
          },
        },
        membershipIdentity: {
          ...client.membershipIdentity,
          create: async (input: { readonly data: MembershipIdentityDatabaseRowV1 }) => {
            transactionWriteCalls.value += 1;
            return client.membershipIdentity.create(input);
          },
        },
      } as IdentityBootstrapDatabaseClientV1;
      try {
        return await work(transaction);
      } catch (error) {
        organizations.clear();
        workspaces.clear();
        projects.clear();
        memberships.clear();
        for (const [id, row] of before.organizations) organizations.set(id, row);
        for (const [id, row] of before.workspaces) workspaces.set(id, row);
        for (const [id, row] of before.projects) projects.set(id, row);
        for (const [id, row] of before.memberships) memberships.set(id, row);
        throw error;
      }
    },
  } as unknown as IdentityBootstrapDatabaseClientV1;
  return {
    client,
    users,
    organizations,
    workspaces,
    projects,
    memberships,
    transactionCalls,
    transactionWriteCalls,
    organizationFindManyCalls,
  };
}

void test('[IAM-001, IAM-009, IAM-011] Prisma bootstrap persists and reconstructs a personal owner hierarchy', async () => {
  const {
    client,
    organizations,
    workspaces,
    projects,
    memberships,
    transactionCalls,
    transactionWriteCalls,
    organizationFindManyCalls,
  } = createDatabase();
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(client);
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;

  await adapter.save(validated.value);
  assert.equal(transactionCalls.value, 1);
  assert.equal(transactionWriteCalls.value, 4);
  assert.equal(organizations.size, 1);
  assert.equal(workspaces.size, 1);
  assert.equal(projects.size, 1);
  assert.equal(memberships.size, 1);
  assert.deepEqual(await adapter.findByUserId(validated.value.user.id), validated.value);
  assert.equal(organizationFindManyCalls.value, 1);
});

void test('[IAM-011] repeated bootstrap is immutable and conflicting hierarchy is rejected', async () => {
  const { client, organizations } = createDatabase();
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(client);
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;

  await adapter.save(validated.value);
  const organization = organizations.get(organizationId);
  assert.ok(organization);
  organizations.set(organizationId, {
    ...organization,
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    createdAt: organization.createdAt,
  } as typeof organization);
  await assert.doesNotReject(() => adapter.save(validated.value));
  await assert.rejects(
    adapter.save({
      ...validated.value,
      organization: { ...validated.value.organization, name: 'Changed' },
    }),
    /IAM_BOOTSTRAP_CONFLICT/,
  );
});

void test('[IAM-001, IAM-011] bootstrap lookup selects the personal organization among multiple ownerships', async () => {
  const state = createDatabase();
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  const unrelatedOrganizationId = '00000000-0000-4000-8000-000000000006';
  const unrelatedMembershipId = '00000000-0000-4000-8000-000000000007';
  state.organizations.set(unrelatedOrganizationId, {
    id: unrelatedOrganizationId,
    name: 'Client organization',
    personal: false,
    status: 'ACTIVE',
    createdAt,
  });
  state.memberships.set(unrelatedMembershipId, {
    id: unrelatedMembershipId,
    principalType: 'USER',
    principalId: userId,
    scopeType: 'ORGANIZATION',
    organizationId: unrelatedOrganizationId,
    workspaceId: null,
    projectId: null,
    roleId: 'owner',
    status: 'ACTIVE',
    startsAt: null,
    expiresAt: null,
    revision: 1,
  });
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(state.client);
  await adapter.save(validated.value);

  assert.equal(
    (await adapter.findByUserId(validated.value.user.id))?.organization.id,
    organizationId,
  );
});

void test('[IAM-011] bootstrap lookup rejects two personal organizations', async () => {
  const state = createDatabase();
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  const secondOrganizationId = '00000000-0000-4000-8000-000000000008';
  const secondMembershipId = '00000000-0000-4000-8000-000000000009';
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(state.client);
  await adapter.save(validated.value);
  state.organizations.set(secondOrganizationId, {
    id: secondOrganizationId,
    name: 'Second personal organization',
    personal: true,
    status: 'ACTIVE',
    createdAt,
  });
  state.memberships.set(secondMembershipId, {
    id: secondMembershipId,
    principalType: 'USER',
    principalId: userId,
    scopeType: 'ORGANIZATION',
    organizationId: secondOrganizationId,
    workspaceId: null,
    projectId: null,
    roleId: 'owner',
    status: 'ACTIVE',
    startsAt: null,
    expiresAt: null,
    revision: 1,
  });

  await assert.rejects(
    adapter.findByUserId(validated.value.user.id),
    /IAM_PERSISTED_ORGANIZATION_INVALID/u,
  );
});

void test('[IAM-009] bootstrap lookup rejects unparseable membership timestamps', async () => {
  const state = createDatabase();
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(state.client);
  await adapter.save(validated.value);
  const membership = state.memberships.get(membershipId);
  assert.ok(membership);
  state.memberships.set(membershipId, { ...membership, expiresAt: new Date('invalid') });

  await assert.rejects(
    adapter.findByUserId(validated.value.user.id),
    /IAM_PERSISTED_MEMBERSHIP_INVALID/u,
  );
});

void test('[IAM-001, IAM-011] bootstrap lookup survives personal workspace and project renames', async () => {
  const state = createDatabase();
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(state.client);
  await adapter.save(validated.value);
  const workspace = state.workspaces.get(workspaceId);
  const project = state.projects.get(projectId);
  assert.ok(workspace);
  assert.ok(project);
  state.workspaces.set(workspaceId, { ...workspace, name: 'Finance workspace' });
  state.projects.set(projectId, { ...project, name: 'Monthly close' });

  const loaded = await adapter.findByUserId(validated.value.user.id);
  assert.equal(loaded?.workspace.name, 'Finance workspace');
  assert.equal(loaded?.project.name, 'Monthly close');
});

void test('[IAM-001] bootstrap transaction rollback does not retain a partially written hierarchy', async () => {
  const state = createDatabase();
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(state.client);
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  await assert.rejects(
    adapter.withTransaction(async (transaction) => {
      await transaction.save(validated.value);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(state.organizations.size, 0);
});
