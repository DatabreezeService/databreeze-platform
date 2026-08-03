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
      try {
        return await work(client);
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
  return { client, users, organizations, workspaces, projects, memberships, transactionCalls };
}

void test('[IAM-001, IAM-009, IAM-011] Prisma bootstrap persists and reconstructs a personal owner hierarchy', async () => {
  const { client, organizations, workspaces, projects, memberships, transactionCalls } =
    createDatabase();
  const adapter = new PrismaIdentityBootstrapRepositoryAdapter(client);
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;

  await adapter.save(validated.value);
  assert.equal(transactionCalls.value, 1);
  assert.equal(organizations.size, 1);
  assert.equal(workspaces.size, 1);
  assert.equal(projects.size, 1);
  assert.equal(memberships.size, 1);
  assert.deepEqual(await adapter.findByUserId(validated.value.user.id), validated.value);
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
