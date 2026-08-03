import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOrganizationIdentityV1,
  type OrganizationIdentityV1,
} from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamHierarchyRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-hierarchy-repository.adapter.js';
import {
  IamHierarchyService,
  type IamHierarchyClockV1,
  type IamHierarchyIdGeneratorV1,
} from '../../../src/features/iam/application/hierarchy.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000131',
  correlation: '00000000-0000-4000-8000-000000000132',
  organization: '00000000-0000-4000-8000-000000000133',
  workspace: '00000000-0000-4000-8000-000000000134',
  project: '00000000-0000-4000-8000-000000000135',
};
const createdAt = new Date('2026-01-02T00:00:00.000Z');

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid hierarchy service fixture identifier');
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
  if (!result.accepted) throw new Error('invalid hierarchy service fixture context');
  return result.value;
}

function organization(): OrganizationIdentityV1 {
  const result = createOrganizationIdentityV1({
    id: ids.organization,
    name: 'Acme',
    createdAt: createdAt.toISOString(),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid hierarchy service organization');
  return result.value;
}

function deterministicIds(...values: string[]): IamHierarchyIdGeneratorV1 {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (!next) throw new Error('test id generator exhausted');
    return next;
  };
}

const clock: IamHierarchyClockV1 = () => createdAt;

void test('[IAM-001, IAM-003] service creates server-identified workspaces and projects in one scoped transaction', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  await repository.seed({ organizations: [organization()], workspaces: [], projects: [] });
  const service = new IamHierarchyService(
    repository,
    deterministicIds(ids.workspace, ids.project),
    clock,
  );
  const organizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'hierarchy-service-001',
  );

  const workspace = await service.createWorkspace(
    organizationContext,
    ids.organization,
    'Operations',
  );
  assert.equal(workspace.accepted, true);
  if (!workspace.accepted) return;
  assert.equal(workspace.value.id, stable(ids.workspace));
  assert.equal(workspace.value.organizationId, stable(ids.organization));

  const project = await service.createProject(
    organizationContext,
    ids.workspace,
    'CLIENT',
    'Northwind',
  );
  assert.equal(project.accepted, true);
  if (!project.accepted) return;
  assert.equal(project.value.id, stable(ids.project));
  assert.equal(project.value.workspaceId, stable(ids.workspace));
});

void test('[IAM-003, IAM-019] service rejects path scope that is not the authenticated organization', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  await repository.seed({ organizations: [organization()], workspaces: [], projects: [] });
  const service = new IamHierarchyService(repository, deterministicIds(ids.workspace), clock);
  const organizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'hierarchy-service-002',
  );

  const result = await service.createWorkspace(
    organizationContext,
    '00000000-0000-4000-8000-000000000199',
    'Operations',
  );
  assert.deepEqual(result, { accepted: false, code: 'SCOPE_DENIED' });
});

void test('[IAM-001] service returns stable input and parent errors without leaking adapter details', async () => {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  const service = new IamHierarchyService(repository, deterministicIds(ids.workspace), clock);
  const organizationContext = context(
    { scopeType: 'organization', organizationId: stable(ids.organization) },
    'hierarchy-service-003',
  );

  assert.deepEqual(
    await service.createWorkspace(organizationContext, ids.organization, ''),
    { accepted: false, code: 'INVALID_TEXT' },
  );
  assert.deepEqual(
    await service.createWorkspace(organizationContext, ids.organization, 'Operations'),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await service.createProject(organizationContext, 'not-an-id', 'CLIENT', 'Northwind'),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
});
