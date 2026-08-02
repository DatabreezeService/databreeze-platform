import assert from 'node:assert/strict';
import test from 'node:test';

import { DeviceSyncAuthorizationAdapter } from '../../../src/features/dso/adapter/device-sync-authorization.adapter.js';
import { InMemoryDeviceAuthorizationRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-device-authorization-repository.adapter.js';
import { DeviceAuthorizationService } from '../../../src/features/dso/application/device-authorization.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000401';
const workspaceId = '00000000-0000-4000-8000-000000000402';
const deviceId = '00000000-0000-4000-8000-000000000403';
const grantId = '00000000-0000-4000-8000-000000000404';
const digest = 'a'.repeat(64);

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId: '00000000-0000-4000-8000-000000000405',
    correlationId: '00000000-0000-4000-8000-000000000406',
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

void test('[DSO-005, IAM-020] synchronization authorization checks grant scope, effect, and revocation', async () => {
  const repository = new InMemoryDeviceAuthorizationRepositoryAdapter();
  const grants = new DeviceAuthorizationService(repository);
  const adapter = new DeviceSyncAuthorizationAdapter(grants);
  const issued = await grants.issueGrant(context('issue'), {
    grantId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    bindingId: '00000000-0000-4000-8000-000000000407',
    capabilityDigest: digest,
    effects: ['READ'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(issued.accepted, true);
  if (!issued.accepted) return;
  assert.deepEqual(
    await adapter.authorize(context('read'), {
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      grantId,
      effect: 'READ',
      now: '2026-01-01T00:30:00.000Z',
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    await adapter.authorize(context('write'), {
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      grantId,
      effect: 'WRITE_DERIVATIVE',
      now: '2026-01-01T00:30:00.000Z',
    }),
    { accepted: false, code: 'GRANT_SCOPE_DENIED' },
  );
  await grants.revokeGrant(context('revoke'), grantId, 1);
  assert.deepEqual(
    await adapter.authorize(context('revoked'), {
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      grantId,
      effect: 'READ',
      now: '2026-01-01T00:30:00.000Z',
    }),
    { accepted: false, code: 'GRANT_REVOKED' },
  );
});
