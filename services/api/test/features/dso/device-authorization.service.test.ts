import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { DeviceAuthorizationService } from '../../../src/features/dso/application/device-authorization.service.js';
import { InMemoryDeviceAuthorizationRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-device-authorization-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const deviceId = '00000000-0000-4000-8000-000000000020';
const userId = '00000000-0000-4000-8000-000000000021';

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 3,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid DSO context');
  return result.value;
}

const signer = {
  sign: (payload: string) => createHash('sha256').update(`key:${payload}`).digest('base64url'),
  verify: (payload: string, signature: string) =>
    createHash('sha256').update(`key:${payload}`).digest('base64url') === signature,
};

void test('[IAM-020, DSO-002, DSO-003] signed snapshots are persisted immutably and verify by epoch', async () => {
  const repository = new InMemoryDeviceAuthorizationRepositoryAdapter();
  const service = new DeviceAuthorizationService(repository);
  const issued = await service.issueSnapshot(
    context('snapshot-1'),
    {
      snapshotId: '00000000-0000-4000-8000-000000000030',
      deviceId,
      userId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      authorizationEpoch: 3,
      revision: 1,
      permissions: ['artifact.read', 'job.execute'],
      dataMode: 'Hybrid',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T12:00:00.000Z',
    },
    signer,
  );
  assert.equal(issued.accepted, true);
  if (!issued.accepted) return;
  assert.equal(
    service.verifySnapshot(
      issued.value,
      {
        now: '2026-01-01T01:00:00.000Z',
        deviceId,
        tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
        authorizationEpoch: 3,
        minimumRevision: 1,
      },
      signer,
    ).accepted,
    true,
  );
  assert.deepEqual(
    service.verifySnapshot(
      { ...issued.value, signature: 'tampered' },
      {
        now: '2026-01-01T01:00:00.000Z',
        deviceId,
        tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
        authorizationEpoch: 3,
        minimumRevision: 1,
      },
      signer,
    ),
    { accepted: false, code: 'SIGNATURE_INVALID' },
  );
});

void test('[DSO-004, DSO-005, DSO-006] opaque grants check online and fail closed after revocation', async () => {
  const repository = new InMemoryDeviceAuthorizationRepositoryAdapter();
  const service = new DeviceAuthorizationService(repository);
  const issued = await service.issueGrant(context('grant-1'), {
    grantId: '00000000-0000-4000-8000-000000000040',
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    bindingId: '00000000-0000-4000-8000-000000000041',
    capabilityDigest: 'sha256:folder-capability',
    authorizationEpoch: 3,
    effects: ['READ', 'WRITE_DERIVATIVE'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T12:00:00.000Z',
  });
  assert.equal(issued.accepted, true);
  if (!issued.accepted) return;
  assert.deepEqual(
    await service.checkGrant(context('check-1'), issued.value.grantId, {
      now: '2026-01-01T01:00:00.000Z',
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    }),
    { accepted: true, value: true },
  );
  const revoked = await service.revokeGrant(context('revoke-1'), issued.value.grantId, 1);
  assert.equal(revoked.accepted, true);
  assert.deepEqual(
    await service.checkGrant(context('check-2'), issued.value.grantId, {
      now: '2026-01-01T01:00:00.000Z',
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    }),
    { accepted: false, code: 'GRANT_REVOKED' },
  );
});
