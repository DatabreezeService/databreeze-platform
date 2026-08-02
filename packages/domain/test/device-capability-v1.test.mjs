import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceCapabilityV1,
  createDeviceGrantV1,
  transitionDeviceCapabilityV1,
} from '../dist/device-capability/v1.js';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const organizationId = id('701');
const workspaceId = id('702');
const deviceId = id('703');
const capabilityId = id('704');
const grantId = id('705');

test('[DSO-002, DSO-013, DSO-017] capabilities are opaque, bounded, and revisioned', () => {
  const capability = createDeviceCapabilityV1({
    capabilityId,
    deviceId,
    organizationId,
    type: 'APPROVED_FOLDER',
    opaqueLocalHandle: 'handle-opaque',
    constraintDigest: 'a'.repeat(64),
    reportedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(capability.accepted, true);
  if (capability.accepted) {
    assert.equal(capability.value.status, 'ACTIVE');
    assert.deepEqual(
      createDeviceCapabilityV1({
        capabilityId,
        deviceId,
        organizationId,
        type: 'APPROVED_FOLDER',
        opaqueLocalHandle: 'C:\\private\\source.xlsx',
        constraintDigest: 'a'.repeat(64),
        reportedAt: '2026-01-01T00:00:00.000Z',
      }),
      { accepted: false, code: 'INVALID_OPAQUE_HANDLE' },
    );
    const paused = transitionDeviceCapabilityV1(capability.value, 'PAUSE', '2026-01-01T00:01:00.000Z');
    assert.equal(paused.accepted, true);
    if (paused.accepted) assert.equal(paused.value.revision, 2);
  }
});

test('[DSO-002, DSO-006, DSO-013] grants bind capability, scope, epoch, actions, and payload classes', () => {
  const grant = createDeviceGrantV1({
    grantId,
    deviceId,
    organizationId,
    workspaceId,
    capabilityId,
    authorizationEpoch: 2,
    allowedActionTypes: ['FOLDER_READ', 'FOLDER_WRITE_DERIVATIVE'],
    allowedDataClassifications: ['INTERNAL', 'CONFIDENTIAL'],
    synchronizationPayloadClasses: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(grant.accepted, true);
  if (grant.accepted) {
    assert.equal(grant.value.revision, 1);
    assert.deepEqual(
      createDeviceGrantV1({
        grantId,
        deviceId,
        organizationId,
        workspaceId,
        capabilityId,
        authorizationEpoch: 2,
        allowedActionTypes: ['*'],
        allowedDataClassifications: ['INTERNAL'],
        synchronizationPayloadClasses: ['CONTROL_METADATA'],
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      }),
      { accepted: false, code: 'INVALID_ACTION' },
    );
  }
});
