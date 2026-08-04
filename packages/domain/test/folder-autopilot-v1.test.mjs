import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAutopilotFolderBindingV1,
  createFolderAutopilotProfileV1,
  createRecipeAssignmentV1,
  isFolderAutopilotDataModeNarrowingV1,
} from '../dist/folder-autopilot/v1.js';

const ids = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  profileId: '33333333-3333-4333-8333-333333333333',
  inputBindingId: '44444444-4444-4444-8444-444444444444',
  outputBindingId: '55555555-5555-4555-8555-555555555555',
  deviceGrantId: '66666666-6666-4666-8666-666666666666',
  deviceId: '77777777-7777-4777-8777-777777777777',
  recipeId: '88888888-8888-4888-8888-888888888888',
  policyVersionId: '99999999-9999-4999-8999-999999999999',
};

const scope = {
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
};

const base = {
  tenantScope: scope,
  createdAt: '2026-08-04T00:00:00.000Z',
};

test('[FA-001..FA-007] profile and binding contracts contain no local path or DSO authority', () => {
  const profile = createFolderAutopilotProfileV1({
    ...base,
    profileId: ids.profileId,
    version: 1,
    payloadHash: 'a'.repeat(64),
    stabilizationDelayMs: 1_000,
    maxFilesPerScan: 100,
    collisionPolicy: 'REVIEW',
    undoWindowSeconds: 3_600,
    outputLineageEnabled: true,
  });
  assert.equal(profile.accepted, true);
  if (!profile.accepted) return;
  assert.equal(profile.value.version, 1);
  assert.equal(Object.isFrozen(profile.value), true);
  assert.equal('path' in profile.value, false);
  assert.equal('status' in profile.value, false);

  const binding = createAutopilotFolderBindingV1({
    ...base,
    bindingId: ids.inputBindingId,
    deviceGrantId: ids.deviceGrantId,
    role: 'INPUT',
    expectedCapabilityDigest: 'b'.repeat(64),
  });
  assert.equal(binding.accepted, true);
  if (!binding.accepted) return;
  assert.deepEqual(Object.keys(binding.value).sort(), [
    'bindingId',
    'createdAt',
    'deviceGrantId',
    'expectedCapabilityDigest',
    'revision',
    'role',
    'schemaVersion',
    'tenantScope',
  ]);
  assert.equal('path' in binding.value, false);
  assert.equal('revokedAt' in binding.value, false);
});

test('[FA-014..FA-015] assignment validates bindings, collision-safe settings, and immutable hashes', () => {
  const assignment = createRecipeAssignmentV1({
    ...base,
    assignmentId: ids.recipeId,
    profileId: ids.profileId,
    profileVersion: 1,
    profileHash: 'a'.repeat(64),
    jraRecipeVersionId: ids.recipeId,
    jraRecipeVersionHash: 'c'.repeat(64),
    deviceId: ids.deviceId,
    inputBindingIds: [ids.inputBindingId],
    outputBindingIds: [ids.outputBindingId],
    dataModeConstraint: 'LOCAL',
    effectiveDataModePolicyRef: ids.policyVersionId,
    idempotencyKey: 'assignment-create-1',
  });
  assert.equal(assignment.accepted, true);
  if (!assignment.accepted) return;
  assert.equal(assignment.value.state, 'DRAFT');
  assert.equal(assignment.value.revision, 1);
  assert.equal(Object.isFrozen(assignment.value.inputBindingIds), true);

  const invalidCollision = createFolderAutopilotProfileV1({
    ...base,
    profileId: ids.profileId,
    version: 2,
    payloadHash: 'd'.repeat(64),
    stabilizationDelayMs: 1_000,
    maxFilesPerScan: 100,
    collisionPolicy: 'OVERWRITE',
    undoWindowSeconds: 3_600,
    outputLineageEnabled: true,
  });
  assert.deepEqual(invalidCollision, { accepted: false, code: 'INVALID_COLLISION_POLICY' });
});

test('[FA-031] assignment data mode constraints can only narrow the DSO maximum', () => {
  assert.equal(isFolderAutopilotDataModeNarrowingV1('CLOUD', 'HYBRID'), true);
  assert.equal(isFolderAutopilotDataModeNarrowingV1('HYBRID', 'LOCAL'), true);
  assert.equal(isFolderAutopilotDataModeNarrowingV1('LOCAL', 'HYBRID'), false);
});
