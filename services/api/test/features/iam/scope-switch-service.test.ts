import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryIamHierarchyRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-hierarchy-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { InMemorySessionLifecycleAdapter } from '../../../src/features/iam/adapter/in-memory-session-lifecycle.adapter.js';
import { IamScopeSwitchService } from '../../../src/features/iam/application/scope-switch.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  user: '00000000-0000-4000-8000-000000000701',
  organization: '00000000-0000-4000-8000-000000000702',
  otherOrganization: '00000000-0000-4000-8000-000000000703',
  workspace: '00000000-0000-4000-8000-000000000704',
  targetWorkspace: '00000000-0000-4000-8000-000000000705',
  foreignWorkspace: '00000000-0000-4000-8000-000000000706',
  project: '00000000-0000-4000-8000-000000000707',
  targetProject: '00000000-0000-4000-8000-000000000708',
  membership: '00000000-0000-4000-8000-000000000709',
};

const timestamp = '2026-08-17T00:00:00.000Z';

function context(sessionId: string, workspaceId: string) {
  const result = createIamTenantContextV1({
    sessionId,
    tenantScope: { scopeType: 'workspace', organizationId: ids.organization, workspaceId },
    actorId: ids.user,
    correlationId: '00000000-0000-4000-8000-000000000710',
    idempotencyKey: 'scope-switch-test',
    authorizationEpoch: 1,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('context setup failed');
  return result.value;
}

async function hierarchy() {
  const repository = new InMemoryIamHierarchyRepositoryAdapter();
  await repository.seed({
    organizations: [
      {
        schemaVersion: 1,
        id: ids.organization,
        name: 'Bright Cloud',
        personal: true,
        status: 'ACTIVE',
        createdAt: timestamp,
      } as never,
      {
        schemaVersion: 1,
        id: ids.otherOrganization,
        name: 'Other Cloud',
        personal: false,
        status: 'ACTIVE',
        createdAt: timestamp,
      } as never,
    ],
    workspaces: [
      {
        schemaVersion: 1,
        id: ids.workspace,
        organizationId: ids.organization,
        name: 'Bright Cloud',
        status: 'ACTIVE',
        authorizationEpoch: 1,
        createdAt: timestamp,
      } as never,
      {
        schemaVersion: 1,
        id: ids.targetWorkspace,
        organizationId: ids.organization,
        name: 'Client projects',
        status: 'ACTIVE',
        authorizationEpoch: 1,
        createdAt: timestamp,
      } as never,
      {
        schemaVersion: 1,
        id: ids.foreignWorkspace,
        organizationId: ids.otherOrganization,
        name: 'Foreign',
        status: 'ACTIVE',
        authorizationEpoch: 1,
        createdAt: timestamp,
      } as never,
    ],
    projects: [
      {
        schemaVersion: 1,
        id: ids.project,
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        kind: 'INTERNAL',
        name: 'Private project',
        status: 'ACTIVE',
        createdAt: timestamp,
      } as never,
      {
        schemaVersion: 1,
        id: ids.targetProject,
        organizationId: ids.organization,
        workspaceId: ids.targetWorkspace,
        kind: 'INTERNAL',
        name: 'Private project',
        status: 'ACTIVE',
        createdAt: timestamp,
      } as never,
    ],
  });
  return repository;
}

function principal() {
  return {
    userId: ids.user,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    securityEpoch: 1,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  } as const;
}

void test('[IAM-028] switches only to an active workspace covered by the actor membership', async () => {
  const sessions = new InMemorySessionLifecycleAdapter();
  const current = await sessions.issue(principal(), 'web');
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: ids.membership,
      principalId: ids.user,
      scope: { scopeType: 'organization', organizationId: ids.organization },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    } as never,
  ]);
  const service = new IamScopeSwitchService(sessions, memberships, await hierarchy());

  const result = await service.switchWorkspace(
    context(current.sessionId, ids.workspace),
    ids.targetWorkspace,
    'web',
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const switched = await sessions.findPrincipal(result.value.session.sessionId);
  assert.equal(
    switched !== undefined && 'workspaceId' in switched ? switched.workspaceId : undefined,
    ids.targetWorkspace,
  );
  assert.equal(await sessions.findPrincipal(current.sessionId), undefined);
});

void test('[IAM-028] rejects a foreign workspace without revoking the current session', async () => {
  const sessions = new InMemorySessionLifecycleAdapter();
  const current = await sessions.issue(principal(), 'web');
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: ids.membership,
      principalId: ids.user,
      scope: { scopeType: 'organization', organizationId: ids.organization },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    } as never,
  ]);
  const service = new IamScopeSwitchService(sessions, memberships, await hierarchy());

  const result = await service.switchWorkspace(
    context(current.sessionId, ids.workspace),
    ids.foreignWorkspace,
    'web',
  );
  assert.deepEqual(result, { accepted: false, code: 'NOT_FOUND' });
  assert.ok(await sessions.findPrincipal(current.sessionId));
});
