import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProtectedDocumentUnlockRequestV1,
  expireProtectedDocumentUnlockRequestV1,
  recordProtectedDocumentUnlockResultV1,
} from '../dist/protected-document/v1.js';

const base = {
  requestId: '11111111-1111-4111-8111-111111111111',
  artifactVersionId: '22222222-2222-4222-8222-222222222222',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '33333333-3333-4333-8333-333333333333',
    workspaceId: '44444444-4444-4444-8444-444444444444',
  },
  deviceId: '55555555-5555-4555-8555-555555555555',
  mode: 'DEVICE_KEYCHAIN',
  maxAttempts: 2,
  createdAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-02T00:30:00.000Z',
};

void test('[IAE-015] unlock state never carries credential material and supports bounded retries', () => {
  const created = createProtectedDocumentUnlockRequestV1(base);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(Object.hasOwn(created.value, 'password'), false);
  assert.equal(Object.hasOwn(created.value, 'secret'), false);
  const failed = recordProtectedDocumentUnlockResultV1(created.value, {
    expectedRevision: 1,
    outcome: 'FAILED',
    failureCode: 'UNLOCK_REJECTED',
    occurredAt: '2026-08-02T00:05:00.000Z',
  });
  assert.equal(failed.accepted, true);
  if (!failed.accepted) return;
  assert.equal(failed.value.state, 'REQUESTED');
  const unlocked = recordProtectedDocumentUnlockResultV1(failed.value, {
    expectedRevision: 2,
    outcome: 'UNLOCKED',
    occurredAt: '2026-08-02T00:06:00.000Z',
  });
  assert.equal(unlocked.accepted, true);
  if (unlocked.accepted) assert.equal(unlocked.value.state, 'UNLOCKED');
});

void test('[IAE-015] device-keychain requests require a device and expire without a secret', () => {
  const missingDevice = createProtectedDocumentUnlockRequestV1({ ...base, deviceId: undefined });
  assert.deepEqual(missingDevice, { accepted: false, code: 'INVALID_IDENTIFIER' });
  const created = createProtectedDocumentUnlockRequestV1(base);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const expired = expireProtectedDocumentUnlockRequestV1(created.value, '2026-08-02T00:30:00.000Z');
  assert.equal(expired.accepted, true);
  if (expired.accepted) assert.equal(expired.value.state, 'EXPIRED');
});
