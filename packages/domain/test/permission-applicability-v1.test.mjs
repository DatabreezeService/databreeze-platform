import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../src/permissions/v1.ts';

const { AUTHORIZATION_CHANNELS_V1, PERMISSION_APPLICABILITY_V1, PERMISSIONS_V1 } = api;

const expectedChannels = Object.freeze({
  'organization.profile.read': ['api', 'web', 'desktop', 'android'],
  'organization.settings.manage': ['api', 'web'],
  'organization.ownership.transfer': ['api', 'web'],
  'workspace.settings.read': ['api', 'web', 'desktop', 'android', 'worker'],
  'workspace.settings.manage': ['api', 'web'],
  'project.record.read': ['api', 'web', 'desktop', 'android', 'worker', 'sync'],
  'project.record.manage': ['api', 'web'],
  'artifact.record.read': ['api', 'web', 'desktop', 'android', 'worker', 'sync', 'shared-link'],
  'artifact.original.download': ['api', 'web', 'desktop', 'android'],
  'artifact.derived.create': ['api', 'web', 'desktop', 'worker'],
  'job.execution.read': ['api', 'web', 'desktop', 'android', 'worker', 'sync', 'stream'],
  'job.execution.create': ['api', 'web', 'desktop', 'worker'],
  'job.execution.run': ['api', 'web', 'desktop', 'worker'],
  'job.execution.cancel': ['api', 'web', 'desktop'],
  'approval.request.read': ['api', 'web', 'desktop', 'android'],
  'approval.decision.create': ['api', 'web', 'android'],
  'billing.account.read': ['api', 'web'],
  'billing.account.manage': ['api', 'web'],
  'device.identity.read': ['api', 'web'],
  'device.identity.revoke': ['api', 'web'],
});

test('[IAM-002, IAM-003] every permission has an explicit closed channel policy', () => {
  assert.deepEqual(Object.keys(PERMISSION_APPLICABILITY_V1), Object.values(PERMISSIONS_V1));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PERMISSION_APPLICABILITY_V1).map(([permission, policy]) => [
        permission,
        policy.allowedChannels,
      ]),
    ),
    expectedChannels,
  );

  assert.ok(Object.isFrozen(AUTHORIZATION_CHANNELS_V1));
  assert.ok(Object.isFrozen(PERMISSION_APPLICABILITY_V1));
  for (const policy of Object.values(PERMISSION_APPLICABILITY_V1)) {
    assert.ok(Object.isFrozen(policy));
    assert.ok(Object.isFrozen(policy.allowedChannels));
  }
});

test('[IAM-002, IAM-003] sensitive actions are closed to shared-link, stream, and sync', () => {
  const sensitive = [
    'organization.settings.manage',
    'organization.ownership.transfer',
    'workspace.settings.manage',
    'project.record.manage',
    'artifact.derived.create',
    'job.execution.create',
    'job.execution.run',
    'job.execution.cancel',
    'approval.decision.create',
    'billing.account.manage',
    'device.identity.revoke',
  ];

  for (const permission of sensitive) {
    for (const channel of ['shared-link', 'stream', 'sync']) {
      assert.equal(
        PERMISSION_APPLICABILITY_V1[permission].allowedChannels.includes(channel),
        false,
      );
    }
  }
});
