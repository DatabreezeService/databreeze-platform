import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import { AgentGrantService } from '../../../src/features/iam/application/agent-grant.service.js';
import { IamMembershipService } from '../../../src/features/iam/application/membership.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { WorkspaceSettingsController } from '../../../src/features/iam/api/workspace-settings.controller.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

function stableIdentifier(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(`invalid test identifier: ${value}`);
  return parsed.value;
}

const ids = {
  organization: stableIdentifier('00000000-0000-4000-8000-000000000201'),
  workspace: stableIdentifier('00000000-0000-4000-8000-000000000202'),
  owner: stableIdentifier('00000000-0000-4000-8000-000000000203'),
  editor: stableIdentifier('00000000-0000-4000-8000-000000000204'),
  viewer: stableIdentifier('00000000-0000-4000-8000-000000000205'),
  correlation: stableIdentifier('00000000-0000-4000-8000-000000000206'),
};

function context(actorId: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    actorId,
    correlationId: ids.correlation,
    idempotencyKey: `settings-${actorId}`,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid settings test context');
  return result.value;
}

function memberships() {
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([
    {
      id: ids.owner,
      principalId: ids.owner,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: ids.editor,
      principalId: ids.editor,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 3,
    },
    {
      id: ids.viewer,
      principalId: ids.viewer,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
      roleId: 'viewer',
      status: 'ACTIVE',
      revision: 2,
    },
  ]);
  return repository;
}

function setup(actorId = ids.owner) {
  const iam = memberships();
  const grants = new AgentGrantService(
    new InMemoryAgentGrantRepositoryAdapter(),
    iam,
    new AccessPresetService(),
  );
  const membershipsService = new IamMembershipService(iam);
  const requestContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context(actorId)),
  };
  return {
    controller: new WorkspaceSettingsController(membershipsService, grants, requestContext),
    grants,
    iam,
    membershipsService,
  };
}

void test('[IAM-024][IAM-025] Owner projection exposes canonical presets and the Viewer grant default', async () => {
  const harness = setup();
  const result = await harness.controller.getSettings({});

  assert.equal(result.canManage, true);
  assert.deepEqual(
    result.members.map((member) => [member.memberId, member.accessPreset, member.agentGrantLevel]),
    [
      [ids.owner, 'OWNER', 'ANALYZE'],
      [ids.editor, 'EDITOR', 'ANALYZE'],
      [ids.viewer, 'VIEWER', 'NONE'],
    ],
  );
  assert.equal(result.members[2]?.agentGrantRevision, 0);
});

void test('[IAM-025] Viewer cannot open workspace member management settings', async () => {
  const { controller } = setup(ids.viewer);

  await assert.rejects(
    () => controller.getSettings({}),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_403',
  );
});

void test('[IAM-002] settings rejects nested client-supplied tenant authority', async () => {
  const { controller } = setup();

  await assert.rejects(
    () => controller.getSettings({ query: { tenantScope: { workspaceId: ids.workspace } } }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
});

void test('[IAM-024] missing IAM projection services are unavailable, never an empty settings page', async () => {
  const controller = new WorkspaceSettingsController(undefined, undefined, {
    resolve: () => Promise.resolve(context(ids.owner)),
  });

  await assert.rejects(
    () => controller.getSettings({}),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_503',
  );
});

void test('[IAM-024] caps an impossible Viewer grant at ANALYZE and keeps mutation authority server-side', async () => {
  const { grants } = setup();
  const result = await grants.setMemberGrant(context(ids.owner), {
    memberId: ids.viewer,
    level: 'APPLY_CONFIRMED_CHANGES',
    expectedRevision: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('TEST_VIEWER_GRANT_REJECTED');
  assert.equal(result.value.level, 'ANALYZE');

  const viewerAttempt = await grants.setMemberGrant(context(ids.viewer), {
    memberId: ids.editor,
    level: 'ANALYZE',
    expectedRevision: 1,
  });
  assert.deepEqual(viewerAttempt, { accepted: false, code: 'SCOPE_DENIED' });
});

void test('[IAM-024] Owner grant changes appear in the canonical settings projection', async () => {
  const { controller, grants } = setup();
  const updated = await grants.setMemberGrant(context(ids.owner), {
    memberId: ids.viewer,
    level: 'ANALYZE',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);

  const projection = await controller.getSettings({});
  const viewer = projection.members.find((member) => member.memberId === ids.viewer);
  assert.equal(viewer?.accessPreset, 'VIEWER');
  assert.equal(viewer?.agentGrantLevel, 'ANALYZE');
  assert.equal(viewer?.agentGrantRevision, 1);
});

void test('[IAM-025] owner management state comes from the current actor membership', async () => {
  const { controller } = setup(ids.owner);
  const result = await controller.getSettings({});

  assert.equal(result.canManage, true);
});

void test('[IAM-025] an unmapped canonical role fails closed instead of inventing a UI preset', async () => {
  const harness = setup(ids.owner);
  harness.iam.seed([
    {
      id: ids.owner,
      principalId: ids.owner,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: ids.editor,
      principalId: ids.editor,
      scope: {
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
      roleId: 'admin',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);

  await assert.rejects(
    () => harness.controller.getSettings({}),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_503',
  );
});
