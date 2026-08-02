import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeviceIdentityV1 } from '@databreeze/domain/identity/v1';

import { IamDeviceIdentityAuthorityAdapter } from '../../../src/features/dso/adapter/iam-device-identity-authority.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000621';
const workspaceId = '00000000-0000-4000-8000-000000000622';
const deviceId = '00000000-0000-4000-8000-000000000623';
const userId = '00000000-0000-4000-8000-000000000624';

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: userId,
    correlationId: '00000000-0000-4000-8000-000000000625',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function device() {
  const result = createDeviceIdentityV1({
    id: deviceId,
    userId,
    organizationId,
    platform: 'WINDOWS',
    publicKey: 'key-material',
    enrolledAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid device');
  return { ...result.value, status: 'ACTIVE' as const, securityEpoch: 4 };
}

void test('[IAM-020, IAM-021] DSO authority adapter reads IAM status and security epoch', async () => {
  const current = device();
  const identity = { get: async () => ({ accepted: true as const, value: current }) };
  const adapter = new IamDeviceIdentityAuthorityAdapter(identity);
  assert.deepEqual(await adapter.inspect(context('active'), { deviceId }), {
    accepted: true,
    value: { deviceId, securityEpoch: 4 },
  });
  assert.deepEqual(
    await adapter.inspect(context('stale'), { deviceId, expectedSecurityEpoch: 3 }),
    { accepted: false, code: 'SECURITY_EPOCH_STALE' },
  );
});

void test('[IAM-020, IAM-021] revoked or unavailable IAM devices fail closed', async () => {
  const revoked = device();
  const identity = {
    get: async () => ({ accepted: true as const, value: { ...revoked, status: 'REVOKED' as const } }),
  };
  const adapter = new IamDeviceIdentityAuthorityAdapter(identity);
  assert.deepEqual(await adapter.inspect(context('revoked'), { deviceId }), {
    accepted: false,
    code: 'DEVICE_REVOKED',
  });
});
