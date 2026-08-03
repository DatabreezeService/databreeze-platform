import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOrganizationIdentityV1,
  createProjectIdentityV1,
  createWorkspaceIdentityV1,
} from '../dist/identity/v1.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000101',
  workspace: '00000000-0000-4000-8000-000000000102',
  project: '00000000-0000-4000-8000-000000000103',
};
const createdAt = '2026-01-01T00:00:00.000Z';

void test('[IAM-001, IAM-003] hierarchy constructors create non-personal organizations with UTC metadata', () => {
  const organization = createOrganizationIdentityV1({
    id: ids.organization,
    name: 'Acme Việt Nam',
    createdAt,
  });
  assert.equal(organization.accepted, true);
  if (!organization.accepted) return;
  assert.equal(organization.value.personal, false);
  assert.equal(organization.value.status, 'ACTIVE');
  assert.equal(organization.value.createdAt, createdAt);
});

void test('[IAM-003, IAM-014] hierarchy constructors preserve ancestry and narrow project kinds', () => {
  const workspace = createWorkspaceIdentityV1({
    id: ids.workspace,
    organizationId: ids.organization,
    name: 'Operations',
    createdAt,
  });
  assert.equal(workspace.accepted, true);
  if (!workspace.accepted) return;
  assert.equal(workspace.value.authorizationEpoch, 1);

  const project = createProjectIdentityV1({
    id: ids.project,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    kind: 'CLIENT',
    name: 'Client rollout',
    createdAt,
  });
  assert.equal(project.accepted, true);
  if (!project.accepted) return;
  assert.equal(project.value.workspaceId, workspace.value.id);
  assert.equal(project.value.kind, 'CLIENT');
});

void test('[IAM-001] hierarchy constructors reject malformed identifiers, names, epochs, and states', () => {
  assert.deepEqual(
    createOrganizationIdentityV1({ id: 'not-an-id', name: 'Org', createdAt }),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
  assert.deepEqual(
    createWorkspaceIdentityV1({
      id: ids.workspace,
      organizationId: ids.organization,
      name: '   ',
      createdAt,
    }),
    { accepted: false, code: 'INVALID_TEXT' },
  );
  assert.deepEqual(
    createWorkspaceIdentityV1({
      id: ids.workspace,
      organizationId: ids.organization,
      name: 'Operations',
      authorizationEpoch: 0,
      createdAt,
    }),
    { accepted: false, code: 'INVALID_EPOCH' },
  );
  assert.deepEqual(
    createProjectIdentityV1({
      id: ids.project,
      organizationId: ids.organization,
      workspaceId: ids.workspace,
      kind: 'UNKNOWN',
      name: 'Project',
      createdAt,
    }),
    { accepted: false, code: 'INVALID_KIND' },
  );
});
