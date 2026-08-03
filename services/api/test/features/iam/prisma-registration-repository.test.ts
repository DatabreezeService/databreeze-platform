import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaRegistrationRepositoryAdapter,
  type RegistrationDatabaseClientV1,
} from '../../../src/features/iam/adapter/prisma-registration-repository.adapter.js';
import {
  RegistrationConflictError,
  type RegistrationPersistenceInputV1,
} from '../../../src/features/iam/application/registration-repository.port.js';

const userId = '00000000-0000-4000-8000-000000000001';
const organizationId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const projectId = '00000000-0000-4000-8000-000000000004';
const membershipId = '00000000-0000-4000-8000-000000000005';
const credentialId = '00000000-0000-4000-8000-000000000006';
const createdAt = new Date('2026-08-03T00:00:00.000Z');

const input: RegistrationPersistenceInputV1 = {
  email: 'user@example.com',
  credentialId,
  credential: {
    schemaVersion: 1,
    algorithm: 'argon2id',
    encodedHash: '$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$ZWZmZw==',
  },
  bootstrap: {
    user: {
      schemaVersion: 1,
      id: userId as never,
      status: 'ACTIVE',
      displayName: 'Nguyen An',
      locale: 'vi-VN',
      securityEpoch: 1,
      createdAt: createdAt.toISOString() as never,
    },
    organization: {
      schemaVersion: 1,
      id: organizationId as never,
      name: "Nguyen An's DataBreeze",
      personal: true,
      status: 'ACTIVE',
      createdAt: createdAt.toISOString() as never,
    },
    workspace: {
      schemaVersion: 1,
      id: workspaceId as never,
      organizationId: organizationId as never,
      name: 'Personal workspace',
      status: 'ACTIVE',
      authorizationEpoch: 1,
      createdAt: createdAt.toISOString() as never,
    },
    project: {
      schemaVersion: 1,
      id: projectId as never,
      organizationId: organizationId as never,
      workspaceId: workspaceId as never,
      kind: 'INTERNAL',
      name: 'Personal project',
      status: 'ACTIVE',
      createdAt: createdAt.toISOString() as never,
    },
    membership: {
      schemaVersion: 1,
      id: membershipId as never,
      principalType: 'USER',
      principalId: userId as never,
      scope: { scopeType: 'organization', organizationId: organizationId as never },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
  },
};

interface State {
  users: Map<string, Record<string, unknown>>;
  credentials: Map<string, Record<string, unknown>>;
  organizations: Map<string, Record<string, unknown>>;
  workspaces: Map<string, Record<string, unknown>>;
  projects: Map<string, Record<string, unknown>>;
  memberships: Map<string, Record<string, unknown>>;
}

function cloneState(state: State): State {
  return {
    users: new Map([...state.users].map(([id, row]) => [id, { ...row }])),
    credentials: new Map([...state.credentials].map(([id, row]) => [id, { ...row }])),
    organizations: new Map([...state.organizations].map(([id, row]) => [id, { ...row }])),
    workspaces: new Map([...state.workspaces].map(([id, row]) => [id, { ...row }])),
    projects: new Map([...state.projects].map(([id, row]) => [id, { ...row }])),
    memberships: new Map([...state.memberships].map(([id, row]) => [id, { ...row }])),
  };
}

function createDatabase() {
  const state: State = {
    users: new Map(),
    credentials: new Map(),
    organizations: new Map(),
    workspaces: new Map(),
    projects: new Map(),
    memberships: new Map(),
  };
  const transactionCalls = { value: 0 };
  const makeIdentityDelegate = (records: Map<string, Record<string, unknown>>) => ({
    findUnique: async ({ where }: { readonly where: Record<string, string> }) => {
      await Promise.resolve();
      const id = where['id'];
      if (id) return records.get(id) ?? null;
      const email = where['email'];
      if (email) return [...records.values()].find((row) => row['email'] === email) ?? null;
      return null;
    },
    create: async ({ data }: { readonly data: Record<string, unknown> }) => {
      await Promise.resolve();
      if (records.has(String(data['id'])))
        throw Object.assign(new Error('P2002'), { code: 'P2002' });
      records.set(String(data['id']), data);
      return data;
    },
    findMany: async ({ where }: { readonly where: Record<string, unknown> }) => {
      await Promise.resolve();
      return [...records.values()].filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
    },
  });
  const client = {
    userIdentity: makeIdentityDelegate(state.users),
    passwordCredential: makeIdentityDelegate(state.credentials),
    organizationIdentity: makeIdentityDelegate(state.organizations),
    workspaceIdentity: makeIdentityDelegate(state.workspaces),
    projectIdentity: makeIdentityDelegate(state.projects),
    membershipIdentity: makeIdentityDelegate(state.memberships),
    $transaction: async <TValue>(
      work: (transaction: RegistrationDatabaseClientV1) => Promise<TValue>,
    ) => {
      transactionCalls.value += 1;
      const before = cloneState(state);
      try {
        return await work(client);
      } catch (error) {
        for (const key of Object.keys(state) as (keyof State)[]) {
          state[key].clear();
          for (const [id, row] of before[key]) state[key].set(id, row);
        }
        throw error;
      }
    },
  } as unknown as RegistrationDatabaseClientV1;
  return { client, state, transactionCalls };
}

void test('[IAM-001, IAM-009] Prisma registration persists the user, credential, and hierarchy in one transaction', async () => {
  const database = createDatabase();
  const adapter = new PrismaRegistrationRepositoryAdapter(database.client);
  await adapter.withTransaction((transaction) => transaction.save(input));
  assert.equal(database.transactionCalls.value, 1);
  assert.equal(database.state.users.size, 1);
  assert.equal(database.state.credentials.size, 1);
  assert.equal(database.state.organizations.size, 1);
  assert.equal(database.state.workspaces.size, 1);
  assert.equal(database.state.projects.size, 1);
  assert.equal(database.state.memberships.size, 1);
  assert.equal(
    await adapter.withTransaction((transaction) => transaction.findByEmail(input.email)),
    true,
  );
  assert.equal(
    await adapter.withTransaction((transaction) => transaction.findByEmail('other@example.com')),
    false,
  );
});

void test('[IAM-001] Prisma registration maps an existing normalized email and concurrent unique race to a conflict', async () => {
  const database = createDatabase();
  const adapter = new PrismaRegistrationRepositoryAdapter(database.client);
  await adapter.withTransaction((transaction) => transaction.save(input));
  assert.equal(
    await adapter.withTransaction((transaction) => transaction.findByEmail('user@example.com')),
    true,
  );
  await assert.rejects(
    adapter.withTransaction((transaction) => transaction.save(input)),
    RegistrationConflictError,
  );
});

void test('[IAM-001] Prisma registration rolls back user and credential when hierarchy persistence fails', async () => {
  const database = createDatabase();
  const failing = {
    ...database.client,
    projectIdentity: {
      ...database.client.projectIdentity,
      create: async () => {
        await Promise.resolve();
        throw new Error('project write failed');
      },
    },
    $transaction: async (work) => {
      const before = cloneState(database.state);
      try {
        return await work(failing);
      } catch (error) {
        for (const key of Object.keys(database.state) as (keyof State)[]) {
          database.state[key].clear();
          for (const [id, row] of before[key]) database.state[key].set(id, row);
        }
        throw error;
      }
    },
  } as RegistrationDatabaseClientV1;
  const adapter = new PrismaRegistrationRepositoryAdapter(failing);
  await assert.rejects(
    adapter.withTransaction((transaction) => transaction.save(input)),
    /project write failed/,
  );
  assert.equal(database.state.users.size, 0);
  assert.equal(database.state.credentials.size, 0);
  assert.equal(database.state.organizations.size, 0);
});
