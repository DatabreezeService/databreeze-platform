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
    assert.equal(challenge.json().accepted, true);

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
    assert.equal(enrolled.json().value.status, 'PENDING');

    const devices = await app.inject({
      method: 'GET',
      url: `/v1/organizations/${organizationId}/devices`,
    });
    assert.equal(devices.statusCode, 200);
    assert.equal(devices.json().value.length, 1);
  } finally {
    await app.close();
  }
});
