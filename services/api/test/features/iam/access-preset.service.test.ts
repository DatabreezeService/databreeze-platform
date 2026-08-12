import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_ROLE_BUNDLES_V1,
  PERMISSIONS_V1,
  type PermissionV1,
} from '@databreeze/domain/permissions/v1';

import {
  AccessPresetService,
  MEMBERSHIP_ACCESS_PRESETS_V1,
} from '../../../src/features/iam/application/access-preset.service.js';

void test('[IAM-025] exposes only Owner, Editor, and Viewer customer access presets', () => {
  assert.deepEqual([...MEMBERSHIP_ACCESS_PRESETS_V1], ['OWNER', 'EDITOR', 'VIEWER']);
});

void test('[IAM-025] maps Owner to the canonical Owner permission bundle', () => {
  const service = new AccessPresetService();
  const mapped = service.resolvePresetPermissions('OWNER');
  assert.equal(mapped.accepted, true);
  if (!mapped.accepted) return;
  assert.equal(mapped.value.roleId, 'owner');
  assert.deepEqual([...mapped.value.permissions], [...INITIAL_ROLE_BUNDLES_V1.owner.permissions]);
});

void test('[IAM-025] maps Viewer to the canonical Viewer permission bundle', () => {
  const service = new AccessPresetService();
  const mapped = service.resolvePresetPermissions('VIEWER');
  assert.equal(mapped.accepted, true);
  if (!mapped.accepted) return;
  assert.equal(mapped.value.roleId, 'viewer');
  assert.deepEqual([...mapped.value.permissions], [...INITIAL_ROLE_BUNDLES_V1.viewer.permissions]);
});

void test('[IAM-025] maps Editor to Analyst plus governed mutation and excludes ownership and billing', () => {
  const service = new AccessPresetService();
  const mapped = service.resolvePresetPermissions('EDITOR');
  assert.equal(mapped.accepted, true);
  if (!mapped.accepted) return;
  assert.equal(mapped.value.roleId, 'analyst');
  for (const permission of INITIAL_ROLE_BUNDLES_V1.analyst.permissions) {
    assert.ok(mapped.value.permissions.includes(permission));
  }
  assert.ok(mapped.value.permissions.includes(PERMISSIONS_V1.PROJECT_RECORD_MANAGE));
  const forbidden: readonly PermissionV1[] = [
    PERMISSIONS_V1.ORGANIZATION_OWNERSHIP_TRANSFER,
    PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE,
    PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE,
    PERMISSIONS_V1.BILLING_ACCOUNT_READ,
    PERMISSIONS_V1.BILLING_ACCOUNT_MANAGE,
    PERMISSIONS_V1.SERVICE_ACCOUNT_MANAGE,
    PERMISSIONS_V1.SERVICE_ACCOUNT_REVOKE,
    PERMISSIONS_V1.DEVICE_IDENTITY_REVOKE,
  ];
  for (const permission of forbidden) {
    assert.equal(mapped.value.permissions.includes(permission), false);
  }
});

void test('[IAM-025] rejects unknown presets deny-by-default', () => {
  const service = new AccessPresetService();
  assert.deepEqual(service.resolvePresetPermissions('ADMIN'), {
    accepted: false,
    code: 'INVALID_PRESET',
  });
});

void test('[IAM-025] derives the customer preset from a server role without inventing authority', () => {
  const service = new AccessPresetService();
  assert.equal(service.presetForRoleId('owner'), 'OWNER');
  assert.equal(service.presetForRoleId('analyst'), 'EDITOR');
  assert.equal(service.presetForRoleId('viewer'), 'VIEWER');
  assert.equal(service.presetForRoleId('admin'), undefined);
  assert.equal(service.presetForRoleId('operator'), undefined);
});
