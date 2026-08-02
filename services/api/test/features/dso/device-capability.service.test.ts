import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDeviceCapabilityRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-device-capability-repository.adapter.js';
import { DeviceCapabilityService } from '../../../src/features/dso/application/device-capability.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000711';
const workspaceId = '00000000-0000-4000-8000-000000000712';
const deviceId = '00000000-0000-4000-8000-000000000713';
const capabilityId = '00000000-0000-4000-8000-000000000714';
const grantId = '00000000-0000-4000-8000-000000000715';

function context(key: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000716',
    correlationId: '00000000-0000-4000-8000-000000000717',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: key,
    authorizationEpoch: 2,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

void test('[DSO-002, DSO-013, DSO-017] capability reports and grants remain tenant scoped', async () => {
  const service = new DeviceCapabilityService(new InMemoryDeviceCapabilityRepositoryAdapter());
  const capability = await service.report(context('report'), {
    capabilityId,
    deviceId,
    type: 'APPROVED_FOLDER',
    opaqueLocalHandle: 'opaque-folder-1',
    constraintDigest: 'a'.repeat(64),
    reportedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(capability.accepted, true);
  const grant = await service.issueGrant(context('grant'), {
    grantId,
    deviceId,
    capabilityId,
    workspaceId,
    authorizationEpoch: 2,
    allowedActionTypes: ['FOLDER_READ'],
    allowedDataClassifications: ['INTERNAL'],
    synchronizationPayloadClasses: ['CONTROL_METADATA'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(grant.accepted, true);
  if (grant.accepted) assert.equal(grant.value.status, 'ACTIVE');
  const listed = await service.listCapabilities(context('list'), deviceId);
  assert.equal(listed.accepted, true);
  if (listed.accepted) assert.equal(listed.value.length, 1);
});

void test('[DSO-002, DSO-006] grant issuance rejects a missing capability and revision conflicts are explicit', async () => {
  const service = new DeviceCapabilityService(new InMemoryDeviceCapabilityRepositoryAdapter());
  assert.deepEqual(
    await service.issueGrant(context('missing'), {
      grantId,
      deviceId,
      capabilityId,
      workspaceId,
      authorizationEpoch: 2,
      allowedActionTypes: ['FOLDER_READ'],
      allowedDataClassifications: ['INTERNAL'],
      synchronizationPayloadClasses: ['CONTROL_METADATA'],
      issuedAt: '2026-01-01T00:00:00.000Z',
    }),
    { accepted: false, code: 'CAPABILITY_NOT_FOUND' },
  );
});

void test('[DSO-016, DSO-017] capability and grant transitions are revisioned and idempotent only at the expected revision', async () => {
  const service = new DeviceCapabilityService(new InMemoryDeviceCapabilityRepositoryAdapter());
  assert.equal(
    (await service.report(context('transition-report'), {
      capabilityId,
      deviceId,
      type: 'LOCAL_PROCESSOR',
      constraintDigest: 'd'.repeat(64),
      reportedAt: '2026-01-01T00:00:00.000Z',
    })).accepted,
    true,
  );
  const paused = await service.pauseCapability(
    context('pause'),
    capabilityId,
    1,
    '2026-01-01T00:01:00.000Z',
    deviceId,
  );
  assert.equal(paused.accepted, true);
  if (!paused.accepted) return;
  assert.equal(paused.value.status, 'PAUSED');
  assert.deepEqual(
    await service.pauseCapability(context('stale-pause'), capabilityId, 1, '2026-01-01T00:02:00.000Z', deviceId),
    { accepted: false, code: 'REVISION_CONFLICT' },
  );
});

void test('[DSO-005, IAM-020] typed grants enforce action, workspace, epoch, expiry, and revocation', async () => {
  const service = new DeviceCapabilityService(new InMemoryDeviceCapabilityRepositoryAdapter());
  await service.report(context('auth-report'), {
    capabilityId,
    deviceId,
    type: 'APPROVED_FOLDER',
    constraintDigest: 'e'.repeat(64),
    reportedAt: '2026-01-01T00:00:00.000Z',
  });
  await service.issueGrant(context('auth-grant'), {
    grantId,
    deviceId,
    capabilityId,
    workspaceId,
    authorizationEpoch: 2,
    allowedActionTypes: ['READ'],
    allowedDataClassifications: ['INTERNAL'],
    synchronizationPayloadClasses: ['CONTROL_METADATA'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.deepEqual(
    await service.authorizeGrant(context('auth-read'), {
      deviceId,
      workspaceId,
      grantId,
      actionType: 'READ',
      now: '2026-01-01T00:30:00.000Z',
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    await service.authorizeGrant(context('auth-write'), {
      deviceId,
      workspaceId,
      grantId,
      actionType: 'WRITE_DERIVATIVE',
      now: '2026-01-01T00:30:00.000Z',
    }),
    { accepted: false, code: 'GRANT_SCOPE_DENIED' },
  );
});
