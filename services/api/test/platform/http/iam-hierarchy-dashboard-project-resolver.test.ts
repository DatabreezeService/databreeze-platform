import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectIdentityV1, type ProjectIdentityV1 } from '@databreeze/domain/identity/v1';

import { IamHierarchyDashboardProjectResolverAdapter } from '../../../src/platform/http/iam-hierarchy-dashboard-project-resolver.adapter.js';
import type { IamHierarchyRepositoryPortV1 } from '../../../src/features/iam/application/hierarchy-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000101',
  organization: '00000000-0000-4000-8000-000000000102',
  workspace: '00000000-0000-4000-8000-000000000103',
  project: '00000000-0000-4000-8000-000000000104',
  archivedProject: '00000000-0000-4000-8000-000000000105',
  secondProject: '00000000-0000-4000-8000-000000000106',
  otherOrganization: '00000000-0000-4000-8000-000000000107',
  otherWorkspace: '00000000-0000-4000-8000-000000000108',
  correlation: '00000000-0000-4000-8000-000000000109',
};

const parsedContext = createIamTenantContextV1({
  tenantScope: {
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
  },
  actorId: ids.actor,
  correlationId: ids.correlation,
  idempotencyKey: 'dashboard-project-resolution',
  authorizationEpoch: 1,
  workspaceAuthorizationEpoch: 1,
});
assert.equal(parsedContext.accepted, true);
if (!parsedContext.accepted) throw new Error('invalid tenant context fixture');
const context = parsedContext.value;

function project(
  id: string,
  status: 'ACTIVE' | 'ARCHIVED',
  organizationId = ids.organization,
  workspaceId = ids.workspace,
): ProjectIdentityV1 {
  const parsed = createProjectIdentityV1({
    id,
    organizationId,
    workspaceId,
    kind: 'INTERNAL',
    name: `Project ${id}`,
    status,
    createdAt: '2026-08-21T00:00:00.000Z',
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid project fixture');
  return parsed.value;
}

function repository(projects: readonly ProjectIdentityV1[]): IamHierarchyRepositoryPortV1 {
  return {
    listProjects: () => Promise.resolve(projects),
  } as unknown as IamHierarchyRepositoryPortV1;
}

void test('[IAM-002, DDA-013] resolves the only active project in the exact authenticated workspace', async () => {
  const resolver = new IamHierarchyDashboardProjectResolverAdapter(
    repository([
      project(ids.archivedProject, 'ARCHIVED'),
      project(ids.project, 'ACTIVE'),
      project(ids.secondProject, 'ACTIVE', ids.otherOrganization, ids.workspace),
      project(ids.secondProject, 'ACTIVE', ids.organization, ids.otherWorkspace),
    ]),
  );

  assert.equal(await resolver.resolveDashboardProject(context), ids.project);
});

void test('[IAM-002] refuses an ambiguous active-project scope instead of selecting arbitrarily', async () => {
  const resolver = new IamHierarchyDashboardProjectResolverAdapter(
    repository([project(ids.project, 'ACTIVE'), project(ids.secondProject, 'ACTIVE')]),
  );

  assert.equal(await resolver.resolveDashboardProject(context), undefined);
});
