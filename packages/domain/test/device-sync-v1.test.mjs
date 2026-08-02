import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  transitionDeviceSyncOperationV1,
} from '../dist/device-sync/v1.js';

const id = (last) => `00000000-0000-4000-8000-0000000000${last}`;
const scope = { scopeType: 'workspace', organizationId: id('01'), workspaceId: id('02') };
const digest = 'a'.repeat(64);

function operation(overrides = {}) {
  return createDeviceSyncOperationV1({
    operationId: id('10'),
    deviceId: id('11'),
    tenantScope: scope,
    entityType: 'artifact-version',
    entityId: id('12'),
    kind: 'UPSERT',
    payloadClass: 'CONTROL_METADATA',
    payloadDigest: digest,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

test('[DSO-011, DSO-012] sync operations are content-bounded and revisioned', () => {
  const created = operation();
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.status, 'QUEUED');
  assert.deepEqual(created.value.dependencyIds, []);
  const accepted = transitionDeviceSyncOperationV1(
    created.value,
    'ACCEPT',
    '2026-01-01T00:00:01.000Z',
  );
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const applied = transitionDeviceSyncOperationV1(
    accepted.value,
    'APPLY',
    '2026-01-01T00:00:02.000Z',
  );
  assert.equal(applied.accepted, true);
  assert.equal(applied.accepted && applied.value.status, 'APPLIED');
});

test('[DSO-006, DSO-013] invalid operation state and local content fail closed', () => {
  const encrypted = operation({ encryptedPayload: 'opaque-encrypted-payload' });
  assert.equal(encrypted.accepted, true);
  const invalid = operation({ encryptedPayload: '\u0000' });
  assert.deepEqual(invalid, { accepted: false, code: 'LOCAL_CONTENT_FORBIDDEN' });
  const created = operation();
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(
    transitionDeviceSyncOperationV1(created.value, 'APPLY', '2026-01-01T00:00:01.000Z'),
    { accepted: false, code: 'INVALID_STATE' },
  );
});

test('[DSO-018] conflicts are explicit and never last-write-wins', () => {
  const conflict = createDeviceSyncConflictV1({
    conflictId: id('20'),
    operationId: id('10'),
    deviceId: id('11'),
    tenantScope: scope,
    entityType: 'artifact-version',
    entityId: id('12'),
    reason: 'REVISION_MISMATCH',
    expectedRevision: 2,
    actualRevision: 3,
    detectedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(conflict.accepted, true);
  assert.equal(conflict.accepted && conflict.value.status, 'OPEN');
});

test('[DSO-019, DSO-020] strict-Local packages expose only digests and expire', () => {
  const manifest = createStrictLocalPackageManifestV1({
    packageId: id('30'),
    deviceId: id('11'),
    tenantScope: scope,
    purpose: 'offline-review',
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    itemDigests: [digest],
    packageDigest: digest,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(manifest.accepted, true);
  assert.equal(manifest.accepted && manifest.value.status, 'ISSUED');
  const userCarried = createStrictLocalPackageManifestV1({
    packageId: id('30'),
    deviceId: id('11'),
    tenantScope: scope,
    purpose: 'offline-review',
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    itemDigests: [digest],
    packageDigest: digest,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(userCarried.accepted, true);
});

test('[DSO-021] receipts bind package digest and verification outcome', () => {
  const receipt = createDeviceTransferReceiptV1({
    receiptId: id('40'),
    packageId: id('30'),
    deviceId: id('11'),
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    packageDigest: digest,
    receivedAt: '2026-01-01T00:00:00.000Z',
    manifestVerified: true,
    status: 'ACCEPTED',
  });
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.accepted && receipt.value.manifestVerified, true);
});
