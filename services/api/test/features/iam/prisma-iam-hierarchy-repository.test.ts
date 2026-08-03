import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrganizationIdentityV1, createWorkspaceIdentityV1 } from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaIamHierarchyRepositoryAdapter,
  type IamHierarchyDatabaseClientV1,
  type OrganizationIdentityDatabaseRowV1,
  type WorkspaceIdentityDatabaseRowV1,
  type ProjectIdentityDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-iam-hierarchy-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000121',
  correlation: '00000000-0000-4000-8000-000000000122',
  organization: '00000000-0000-4000-8000-000000000123',
  siblingOrganization: '00000000-0000-4000-8000-000000000124',
  workspace: '00000000-0000-4000-8000-000000000125',
  siblingWorkspace: '00000000-0000-4000-8000-000000000126',
  project: '00000000-0000-4000-8000-000000000127',
};
const createdAt = new Date('2026-01-01T00:00:00.000Z');

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid Prisma hierarchy fixture identifier');
  return parsed.value;
}

function context(scope: unknown, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId: stable(ids.principal),
    correlationId: stable(ids.correlation),
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid Prisma hierarchy fixture context');
  return result.value;
}

function createDatabase(): {
  readonly client: IamHierarchyDatabaseClientV1;
  readonly organizations: Map<string, OrganizationIdentityDatabaseRowV1>;
  readonly workspaces: Map<string, WorkspaceIdentityDatabaseRowV1>;
  readonly projects: Map<string, ProjectIdentityDatabaseRowV1>;
  readonly transactionCalls: { value: number };
} {
  const organizations = new Map<string, OrganizationIdentityDatabaseRowV1>();
  const workspaces = new Map<string, WorkspaceIdentityDatabaseRowV1>();
  const projects = new Map<string, ProjectIdentityDatabaseRowV1>();
  const transactionCalls = { value: 0 };
  const filter = <TRow extends object>(rows: Map<string, TRow>, where: Readonly<Record<string, unknown>>) =>
    [...rows.values()].filter((row) =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'OR' && Array.isArray(value)) {
          return value.some((candidate) =>
            Object.entries(candidate as Record<string, unknown>).every(
              ([candidateKey, candidateValue]) => row[candidateKey as keyof TRow] === candidateValue,
            ),
          );
        }
        return row[key as keyof TRow] === value;
      }),
    );
  const delegates = {
    organizationIdentity: {
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        organizations.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        filter(organizations, where),
      create: async ({ data }: { readonly data: OrganizationIdentityDatabaseRowV1 }) => {
        organizations.set(data.id, data);
        return data;
      },
    },
    workspaceIdentity: {
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        workspaces.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        filter(workspaces, where),
      create: async ({ data }: { readonly data: WorkspaceIdentityDatabaseRowV1 }) => {
        workspaces.set(data.id, data);
        return data;
      },
    },
    projectIdentity: {
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        projects.get(where.id) ?? null,
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        filter(projects, where),
      create: async ({ data }: { readonly data: ProjectIdentityDatabaseRowV1 }) => {
        projects.set(data.id, data);
        return data;
      },
    },
  };
  const client = {
    ...delegates,
    $transaction: async <TValue>(work: (transaction: IamHierarchyDatabaseClientV1) => Promise<TValue>) => {
      transactionCalls.value += 1;
      const before = {
        organizations: new Map(organizations),
        workspaces: new Map(workspaces),
        projects: new Map(projects),
      };
      try {
        return await work(client as IamHierarchyDatabaseClientV1);
      } catch (error) {
        organizations.clear();
        workspaces.clear();
        projects.clear();
        for (const [id, row] of before.organizations) organizations.set(id, row);
        for (const [id, row] of before.workspaces) workspaces.set(id, row);
        for (const [id, row] of before.projects) projects.set(id, row);
        throw error;
      }
    },
  } as unknown as IamHierarchyDatabaseClientV1;
  return { client, organizations, workspaces, projects, transactionCalls };
}

void test('[IAM-001, IAM-003, IAM-019] Prisma hierarchy adapter scopes reads and maps rows through domain validation', async () => {
  const state = createDatabase();
  const adapter = new PrismaIamHierarchyRepositoryAdapter(state.client);
  const organization = createOrganizationIdentityV1({
    id: ids.organization,
    name: 'Acme',
    createdAt: createdAt.toISOString(),
  });
  const workspace = createWorkspaceIdentityV1({
    id: ids.workspace,
    organizationId: ids.organization,
    name: 'Operations',
    createdAt: createdAt.toISOString(),
  });
  assert.equal(organization.accepted, true);
  assert.equal(workspace.accepted, true);
  if (!organization.accepted || !workspace.accepted) return;
  const organizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'prisma-hierarchy-001',
  );
  await adapter.saveOrganization(organizationContext, organization.value);
  await adapter.saveWorkspace(organizationContext, workspace.value);
  const loaded = await adapter.findWorkspace(organizationContext, stable(ids.workspace));
  assert.equal(loaded?.name, 'Operations');
  assert.equal(
    await adapter.findWorkspace(
      context(
        { scopeType: 'organization', organizationId: stable(ids.siblingOrganization) },
        'prisma-hierarchy-002',
      ),
      stable(ids.workspace),
    ),
    undefined,
  );
  assert.equal(state.transactionCalls.value, 2);
});

void test('[IAM-001] Prisma hierarchy transactions roll back staged writes', async () => {
  const state = createDatabase();
  const adapter = new PrismaIamHierarchyRepositoryAdapter(state.client);
  const transactionContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'prisma-hierarchy-003',
  );
  const organization = createOrganizationIdentityV1({
    id: ids.organization,
    name: 'Acme',
    createdAt: createdAt.toISOString(),
  });
  assert.equal(organization.accepted, true);
  if (!organization.accepted) return;
  await assert.rejects(
    adapter.withTransaction(transactionContext, async (transaction) => {
      await transaction.saveOrganization(transactionContext, organization.value);
      throw new Error('prisma hierarchy rollback');
    }),
    /prisma hierarchy rollback/u,
  );
  assert.equal(state.organizations.size, 0);
});
