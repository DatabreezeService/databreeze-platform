import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDeviceIdentityRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-device-identity-repository.adapter.js';
import { DeviceIdentityService } from '../../../src/features/iam/application/device-identity.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000621';
const userId = '00000000-0000-4000-8000-000000000622';
const challengeId = '00000000-0000-4000-8000-000000000623';
const deviceId = '00000000-0000-4000-8000-000000000624';

function context() {
  const result = createIamTenantContextV1({
    actorId: userId,
    correlationId: '00000000-0000-4000-8000-000000000625',
    tenantScope: { scopeType: 'organization', organizationId },
    idempotencyKey: 'device-http',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function jsonObject(response: { json(): unknown }): Record<string, unknown> {
  const value = response.json();
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

void test('[IAM-007, IAM-021] device identity HTTP endpoints use the authenticated organization context', async () => {
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const service = new DeviceIdentityService(new InMemoryDeviceIdentityRepositoryAdapter(), {
    verify: () => true,
  });
  const { app } = await createApiApplication({
    deviceIdentityService: service,
    requestTenantContext,
  });
  try {
    const challenge = await app.inject({
      method: 'POST',
      url: '/v1/devices/enrollment-challenges',
      payload: {
        challengeId,
        platform: 'WINDOWS',
        installationIdHash: 'a'.repeat(64),
        challengeDigest: 'b'.repeat(64),
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:05:00.000Z',
      },
    });
    assert.equal(challenge.statusCode, 200);
    assert.equal(jsonObject(challenge)['accepted'], true);

    const enrolled = await app.inject({
      method: 'POST',
      url: '/v1/devices/enroll',
      payload: {
        challengeId,
        deviceId,
        publicKey: 'ed25519-device-key',
        proof: 'proof',
        now: '2026-01-01T00:01:00.000Z',
      },
    });
    assert.equal(enrolled.statusCode, 200);
    const enrolledValue = jsonObject(enrolled)['value'];
    assert.equal(typeof enrolledValue, 'object');
    assert.notEqual(enrolledValue, null);
    assert.equal((enrolledValue as Record<string, unknown>)['status'], 'PENDING');

    const devices = await app.inject({
      method: 'GET',
      url: `/v1/organizations/${organizationId}/devices`,
    });
    assert.equal(devices.statusCode, 200);
    const devicesValue = jsonObject(devices)['value'];
    assert.ok(Array.isArray(devicesValue));
    assert.equal(devicesValue.length, 1);

    const denied = await app.inject({
      method: 'GET',
      url: '/v1/organizations/00000000-0000-4000-8000-000000000699/devices',
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(jsonObject(denied)['code'], 'DEVICE_SCOPE_DENIED');
  } finally {
    await app.close();
  }
});

void test('[IAM-007] device identity persistence failures return a retryable unavailable problem', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context()),
  };
  const unavailableService = {
    issueEnrollmentChallenge: () => Promise.reject(new Error('database unavailable')),
  } as unknown as DeviceIdentityService;
  const { app } = await createApiApplication({
    deviceIdentityService: unavailableService,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/enrollment-challenges',
      payload: {
        challengeId,
        platform: 'WINDOWS',
        installationIdHash: 'a'.repeat(64),
        challengeDigest: 'b'.repeat(64),
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:05:00.000Z',
      },
    });
    assert.equal(response.statusCode, 503);
    const problem = jsonObject(response);
    assert.equal(problem['code'], 'DEVICE_UNAVAILABLE');
    assert.equal(problem['retryable'], true);
  } finally {
    await app.close();
  }
});
