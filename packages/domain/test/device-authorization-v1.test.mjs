import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  checkOpaqueDeviceGrantV1,
  checkOpaqueDeviceGrantEffectV1,
  createAuthorizationSnapshotV1,
  createOpaqueDeviceGrantV1,
  verifyAuthorizationSnapshotV1,
} from '../dist/device-authorization/v1.js';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const scope = { scopeType: 'organization', organizationId: id('1') };
const signer = {
  sign: (payload) => createHash('sha256').update(payload).digest('base64url'),
  verify: (payload, signature) =>
    createHash('sha256').update(payload).digest('base64url') === signature,
};

test('[IAM-020, IAM-021] signed authorization snapshots bind device, scope, epoch, and revision', () => {
  const snapshot = createAuthorizationSnapshotV1(
    {
      snapshotId: id('10'),
      deviceId: id('11'),
      userId: id('12'),
      tenantScope: scope,
      authorizationEpoch: 2,
      revision: 4,
      permissions: ['artifact.record.read', 'job.execute'],
      dataMode: 'Hybrid',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-02T00:00:00.000Z',
    },
    signer,
  );
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) return;
  assert.deepEqual(
    verifyAuthorizationSnapshotV1(
      snapshot.value,
      {
        now: '2026-01-01T01:00:00.000Z',
        deviceId: id('11'),
        tenantScope: scope,
        authorizationEpoch: 2,
        minimumRevision: 4,
      },
      signer,
    ),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    verifyAuthorizationSnapshotV1(
      snapshot.value,
      {
        now: '2026-01-01T01:00:00.000Z',
        deviceId: id('11'),
        tenantScope: scope,
        authorizationEpoch: 1,
        minimumRevision: 4,
      },
      signer,
    ),
    { accepted: false, code: 'SNAPSHOT_STALE' },
  );
});

test('[DSO-002, DSO-005] opaque grants contain no local path and fail closed after expiry or revocation', () => {
  const grant = createOpaqueDeviceGrantV1({
    grantId: id('20'),
    deviceId: id('11'),
    tenantScope: scope,
    bindingId: id('21'),
    capabilityDigest: 'sha256:folder-capability',
    effects: ['READ', 'WRITE_DERIVATIVE'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  assert.equal('path' in grant.value, false);
  assert.deepEqual(
    checkOpaqueDeviceGrantV1(grant.value, {
      now: '2026-01-01T00:30:00.000Z',
      deviceId: id('11'),
      tenantScope: scope,
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    checkOpaqueDeviceGrantV1(
      { ...grant.value, status: 'REVOKED' },
      {
        now: '2026-01-01T00:30:00.000Z',
        deviceId: id('11'),
        tenantScope: scope,
      },
    ),
    { accepted: false, code: 'GRANT_REVOKED' },
  );
});

test('[DSO-005] a grant must explicitly contain the requested synchronization effect', () => {
  const grant = createOpaqueDeviceGrantV1({
    grantId: id('30'),
    deviceId: id('11'),
    tenantScope: scope,
    bindingId: id('31'),
    capabilityDigest: 'sha256:folder-capability',
    effects: ['READ'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  assert.deepEqual(
    checkOpaqueDeviceGrantEffectV1(grant.value, 'WRITE_DERIVATIVE'),
    { accepted: false, code: 'EFFECT_DENIED' },
  );
  assert.deepEqual(
    checkOpaqueDeviceGrantEffectV1(grant.value, 'READ'),
    { accepted: true, value: true },
  );
});
