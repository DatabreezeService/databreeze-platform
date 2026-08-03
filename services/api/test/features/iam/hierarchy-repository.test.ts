import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOrganizationIdentityV1,
  createProjectIdentityV1,
  createWorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamHierarchyRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-hierarchy-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000111',
  correlation: '00000000-0000-4000-8000-000000000112',
  organization: '00000000-0000-4000-8000-000000000113',
  otherOrganization: '00000000-0000-4000-8000-000000000114',
  workspace: '00000000-0000-4000-8000-000000000115',
  otherWorkspace: '00000000-0000-4000-8000-000000000116',
  project: '00000000-0000-4000-8000-000000000117',
};
const createdAt = '2026-01-01T00:00:00.000Z';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid hierarchy fixture identifier');
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
  if (!result.accepted) throw new Error('invalid hierarchy fixture context');
  return result.value;
}

function organization(id: string, name: string) {
  const result = createOrganizationIdentityV1({ id, name, createdAt });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid organization fixture');
  return result.value;
}

function workspace(id: string, organizationId: string, name: string) {
  const result = createWorkspaceIdentityV1({ id, organizationId, name, createdAt });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid workspace fixture');
  return result.value;
}

function project(id: string, organizationId: string, workspaceId: string) {
  const result = createProjectIdentityV1({
    id,
    organizationId,
    workspaceId,
    kind: 'INTERNAL',
    name: 'Project',
    createdAt,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid project fixture');
  return result.value;
}

void test('[IAM-003, IAM-019] hierarchy repository only exposes records inside the complete tenant ancestry', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  await repository.seed({
    organizations: [organization(ids.organization, 'Acme')],
    workspaces: [
      workspace(ids.workspace, ids.organization, 'Operations'),
      workspace(ids.otherWorkspace, ids.organization, 'Finance'),
    ],
    projects: [project(ids.project, ids.organization, ids.workspace)],
  });

  const workspaceContext = context(
    {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    'hierarchy-read-001',
  );
  assert.equal(
    (await repository.findWorkspace(workspaceContext, stable(ids.workspace)))?.name,
    'Operations',
  );
  assert.equal(
    await repository.findWorkspace(workspaceContext, stable(ids.otherWorkspace)),
    undefined,
  );
  assert.equal(
    (await repository.findProject(workspaceContext, stable(ids.project)))?.id,
    stable(ids.project),
  );

  const siblingOrganizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.otherOrganization) },
    'hierarchy-read-002',
  );
  assert.equal(
    await repository.findOrganization(siblingOrganizationContext, stable(ids.organization)),
    undefined,
  );
});

void test('[IAM-019] hierarchy writes reject missing parents, sibling scopes, and conflicting immutable identities', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  await repository.seed({
    organizations: [organization(ids.organization, 'Acme')],
    workspaces: [workspace(ids.workspace, ids.organization, 'Operations')],
    projects: [],
  });
  const organizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'hierarchy-write-001',
  );
  await assert.rejects(
    repository.saveWorkspace(
      organizationContext,
      workspace(ids.otherWorkspace, ids.otherOrganization, 'Outside'),
    ),
    /IAM_SCOPE_DENIED/u,
  );
  await assert.rejects(
    repository.saveProject(
      organizationContext,
      project(ids.project, ids.organization, ids.otherWorkspace),
    ),
    /IAM_PARENT_NOT_FOUND/u,
  );
  await repository.saveWorkspace(
    organizationContext,
    workspace(ids.otherWorkspace, ids.organization, 'Finance'),
  );
  await assert.rejects(
    repository.saveWorkspace(
      organizationContext,
      workspace(ids.otherWorkspace, ids.organization, 'Renamed'),
    ),
    /IAM_HIERARCHY_CONFLICT/u,
  );
  const equivalentWorkspace = workspace(ids.otherWorkspace, ids.organization, 'Finance');
  await repository.saveWorkspace(organizationContext, {
    name: equivalentWorkspace.name,
    id: equivalentWorkspace.id,
    organizationId: equivalentWorkspace.organizationId,
    schemaVersion: equivalentWorkspace.schemaVersion,
    status: equivalentWorkspace.status,
    authorizationEpoch: equivalentWorkspace.authorizationEpoch,
    createdAt: equivalentWorkspace.createdAt,
  });
});

void test('[IAM-001] hierarchy transaction rolls back all staged writes', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  const transactionContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'hierarchy-transaction-001',
  );
  await assert.rejects(
    repository.withTransaction(transactionContext, async (transaction) => {
      await transaction.saveOrganization(
        transactionContext,
        organization(ids.organization, 'Acme'),
      );
      await transaction.saveWorkspace(
        transactionContext,
        workspace(ids.workspace, ids.organization, 'Operations'),
      );
      throw new Error('hierarchy rollback');
    }),
    /hierarchy rollback/u,
  );
  assert.equal(
    await repository.findOrganization(transactionContext, stable(ids.organization)),
    undefined,
  );
  assert.equal(
    await repository.findWorkspace(transactionContext, stable(ids.workspace)),
    undefined,
  );
});
