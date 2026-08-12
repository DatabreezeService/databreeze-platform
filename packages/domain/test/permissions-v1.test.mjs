import assert from 'node:assert/strict';
import test from 'node:test';

async function loadPermissions() {
  try {
    return await import('../dist/permissions/v1.js');
  } catch {
    return undefined;
  }
}

test('[IAM-004] publishes a closed versioned permission vocabulary', async () => {
  const api = await loadPermissions();

  assert.ok(api, 'the permissions/v1 module must exist');
  assert.equal(api.PERMISSION_SCHEMA_VERSION_V1, 1);
  assert.deepEqual(Object.values(api.PERMISSIONS_V1), [
    'organization.profile.read',
    'organization.settings.manage',
    'organization.ownership.transfer',
    'workspace.settings.read',
    'workspace.settings.manage',
    'project.record.read',
    'project.record.manage',
    'artifact.record.read',
    'artifact.original.download',
    'artifact.derived.create',
    'job.execution.read',
    'job.execution.create',
    'job.execution.run',
    'job.execution.cancel',
    'approval.request.read',
    'approval.decision.create',
    'billing.account.read',
    'billing.account.manage',
    'device.identity.read',
    'device.identity.revoke',
    'service.account.read',
    'service.account.manage',
    'service.account.revoke',
  ]);
  assert.ok(Object.isFrozen(api.PERMISSIONS_V1));
});

test('[IAM-004] maps exactly six immutable initial role bundles', async () => {
  const api = await loadPermissions();
  assert.ok(api);

  assert.deepEqual(api.INITIAL_ROLE_IDS_V1, [
    'owner',
    'admin',
    'analyst',
    'operator',
    'approver',
    'viewer',
  ]);

  const expected = {
    owner: [
      'organization.profile.read',
      'organization.settings.manage',
      'organization.ownership.transfer',
      'workspace.settings.read',
      'workspace.settings.manage',
      'project.record.read',
      'project.record.manage',
      'job.execution.read',
      'billing.account.read',
      'billing.account.manage',
      'device.identity.read',
      'device.identity.revoke',
      'service.account.read',
      'service.account.manage',
      'service.account.revoke',
    ],
    admin: [
      'organization.profile.read',
      'organization.settings.manage',
      'workspace.settings.read',
      'workspace.settings.manage',
      'project.record.read',
      'project.record.manage',
      'job.execution.read',
      'device.identity.read',
      'device.identity.revoke',
      'service.account.read',
      'service.account.manage',
      'service.account.revoke',
    ],
    analyst: [
      'organization.profile.read',
      'workspace.settings.read',
      'project.record.read',
      'artifact.record.read',
      'artifact.original.download',
      'artifact.derived.create',
      'job.execution.read',
      'job.execution.create',
      'job.execution.run',
      'job.execution.cancel',
    ],
    operator: [
      'organization.profile.read',
      'workspace.settings.read',
      'project.record.read',
      'artifact.record.read',
      'artifact.derived.create',
      'job.execution.read',
      'job.execution.run',
    ],
    approver: [
      'organization.profile.read',
      'workspace.settings.read',
      'project.record.read',
      'artifact.record.read',
      'job.execution.read',
      'approval.request.read',
      'approval.decision.create',
    ],
    viewer: [
      'organization.profile.read',
      'workspace.settings.read',
      'project.record.read',
      'artifact.record.read',
      'job.execution.read',
    ],
  };

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(api.INITIAL_ROLE_BUNDLES_V1).map(([roleId, bundle]) => [
        roleId,
        bundle.permissions,
      ]),
    ),
    expected,
  );

  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.owner.name, 'Owner');
  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.admin.name, 'Admin');
  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.analyst.name, 'Analyst');
  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.operator.name, 'Operator');
  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.approver.name, 'Approver');
  assert.equal(api.INITIAL_ROLE_BUNDLES_V1.viewer.name, 'Viewer');
  assert.ok(Object.isFrozen(api.INITIAL_ROLE_IDS_V1));
  assert.ok(Object.isFrozen(api.INITIAL_ROLE_BUNDLES_V1));
  for (const bundle of Object.values(api.INITIAL_ROLE_BUNDLES_V1)) {
    assert.ok(Object.isFrozen(bundle));
    assert.ok(Object.isFrozen(bundle.permissions));
  }

  for (const permission of api.INITIAL_ROLE_BUNDLES_V1.admin.permissions) {
    assert.equal(
      api.INITIAL_ROLE_BUNDLES_V1.owner.permissions.includes(permission),
      true,
      `Owner must retain the Admin permission ${permission}`,
    );
  }
});

test('[IAM-004] role lookup denies unknown roles and permissions', async () => {
  const api = await loadPermissions();
  assert.ok(api);

  assert.equal(api.roleHasPermissionV1('viewer', 'artifact.record.read'), true);
  assert.equal(api.roleHasPermissionV1('viewer', 'billing.account.manage'), false);
  assert.equal(api.roleHasPermissionV1('custom-admin', 'artifact.record.read'), false);
  assert.equal(api.roleHasPermissionV1('owner', 'future.resource.read'), false);
  assert.equal(api.isRoleIdV1('Owner'), false);
  assert.equal(api.isPermissionV1('artifact.read'), false);
});

test('[IAM-003, IAM-004] administration roles do not bypass approval policy', async () => {
  const api = await loadPermissions();
  assert.ok(api);

  assert.equal(api.roleHasPermissionV1('owner', 'approval.decision.create'), false);
  assert.equal(api.roleHasPermissionV1('admin', 'approval.decision.create'), false);
  assert.equal(api.roleHasPermissionV1('approver', 'approval.decision.create'), true);
});

test('[IAM-024, IAM-025] publishes versioned access presets and monotonic agent grant levels', async () => {
  const api = await loadPermissions();
  assert.ok(api);

  assert.deepEqual([...api.MEMBERSHIP_ACCESS_PRESETS_V1], ['OWNER', 'EDITOR', 'VIEWER']);
  assert.equal(api.ACCESS_PRESET_MAPPINGS_V1.OWNER.roleId, 'owner');
  assert.equal(api.ACCESS_PRESET_MAPPINGS_V1.EDITOR.roleId, 'analyst');
  assert.equal(api.ACCESS_PRESET_MAPPINGS_V1.VIEWER.roleId, 'viewer');
  assert.ok(
    api.ACCESS_PRESET_MAPPINGS_V1.EDITOR.permissions.includes('project.record.manage'),
  );
  assert.equal(
    api.ACCESS_PRESET_MAPPINGS_V1.EDITOR.permissions.includes('billing.account.manage'),
    false,
  );
  assert.deepEqual(api.AGENT_LEVEL_ORDER_V1, {
    NONE: 0,
    ANALYZE: 1,
    PROPOSE_CHANGES: 2,
    APPLY_CONFIRMED_CHANGES: 3,
  });
  assert.equal(api.defaultAgentGrantLevelForPresetV1('VIEWER'), 'NONE');
  assert.equal(api.defaultAgentGrantLevelForPresetV1('EDITOR'), 'ANALYZE');
  assert.equal(api.maxAgentGrantLevelForPresetV1('VIEWER'), 'ANALYZE');
  assert.equal(api.lesserAgentGrantLevelV1('APPLY_CONFIRMED_CHANGES', 'ANALYZE'), 'ANALYZE');
});
