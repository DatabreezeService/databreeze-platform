import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDeviceIdentityRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-device-identity-repository.adapter.js';
import { DeviceIdentityService } from '../../../src/features/iam/application/device-identity.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000601';
const otherOrganizationId = '00000000-0000-4000-8000-000000000602';
const userId = '00000000-0000-4000-8000-000000000603';
const challengeId = '00000000-0000-4000-8000-000000000604';
const deviceId = '00000000-0000-4000-8000-000000000605';
const correlationId = '00000000-0000-4000-8000-000000000606';

function context(candidateOrganizationId = organizationId, key = 'device') {
  const result = createIamTenantContextV1({
    actorId: userId,
    correlationId,
    tenantScope: { scopeType: 'organization', organizationId: candidateOrganizationId },
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

void test('[IAM-007, IAM-021] enrollment, activation, key rotation, and permanent revocation are transactional', async () => {
  const service = new DeviceIdentityService(new InMemoryDeviceIdentityRepositoryAdapter(), {
    verify: () => true,
  });
  const challenge = await service.issueEnrollmentChallenge(context(), {
    challengeId,
    platform: 'WINDOWS',
    installationIdHash: 'a'.repeat(64),
    challengeDigest: 'b'.repeat(64),
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:05:00.000Z',
  });
  assert.equal(challenge.accepted, true);
  const enrolled = await service.enroll(context(), {
    challengeId,
    deviceId,
    publicKey: 'ed25519-device-key',
    now: '2026-01-01T00:01:00.000Z',
    proof: 'challenge-proof',
  });
  assert.equal(enrolled.accepted, true);
  if (!enrolled.accepted) return;
  assert.equal(enrolled.value.status, 'PENDING');
  const activated = await service.activate(context(), deviceId, 1, '2026-01-01T00:02:00.000Z');
  assert.equal(activated.accepted, true);
  const rotated = await service.rotateKey(
    context(),
    deviceId,
    2,
    'ed25519-device-key-2',
    '2026-01-01T00:03:00.000Z',
  );
  assert.equal(rotated.accepted, true);
  const revoked = await service.revoke(context(), deviceId, 3, '2026-01-01T00:04:00.000Z');
  assert.equal(revoked.accepted, true);
  const again = await service.activate(context(), deviceId, 4, '2026-01-01T00:05:00.000Z');
  assert.deepEqual(again, { accepted: false, code: 'DEVICE_REVOKED' });
});

void test('[IAM-009, IAM-021] enrollment is proof-bound and organization scoped', async () => {
  const service = new DeviceIdentityService(new InMemoryDeviceIdentityRepositoryAdapter(), {
    verify: () => false,
  });
  await service.issueEnrollmentChallenge(context(), {
    challengeId,
    platform: 'ANDROID',
    installationIdHash: 'c'.repeat(64),
    challengeDigest: 'd'.repeat(64),
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:05:00.000Z',
  });
  assert.deepEqual(
    await service.enroll(context(), {
      challengeId,
      deviceId,
      publicKey: 'ed25519-device-key',
      now: '2026-01-01T00:01:00.000Z',
      proof: 'bad-proof',
    }),
    { accepted: false, code: 'PROOF_INVALID' },
  );
  assert.deepEqual(await service.get(context(otherOrganizationId, 'other-org'), deviceId), {
    accepted: false,
    code: 'DEVICE_NOT_FOUND',
  });
});
