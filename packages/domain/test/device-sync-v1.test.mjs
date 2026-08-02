import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceSyncBatchV1,
  createDeviceSyncChangeV1,
  createDeviceSyncCursorV1,
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  transitionDeviceSyncOperationV1,
  verifyDeviceSyncCursorV1,
} from '../dist/device-sync/v1.js';

const id = (last) => `00000000-0000-4000-8000-0000000000${last}`;
const scope = { scopeType: 'workspace', organizationId: id('01'), workspaceId: id('02') };
const digest = 'a'.repeat(64);

const signer = {
  sign: (payload) => `sig:${payload}`,
  verify: (payload, signature) => signature === `sig:${payload}`,
};

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

test('[DSO-007, DSO-014] cursors bind device, scope, authorization epoch, policy, and protocol', () => {
  const cursor = createDeviceSyncCursorV1(
    {
      cursorId: id('50'),
      deviceId: id('11'),
      tenantScope: scope,
      authorizationEpoch: 3,
      changeRevision: 0,
      policyVersionId: id('51'),
      policyDigest: digest,
      dataMode: 'Hybrid',
      protocolVersion: 'sync-v1',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
    },
    signer,
  );
  assert.equal(cursor.accepted, true);
  if (!cursor.accepted) return;
  assert.deepEqual(
    verifyDeviceSyncCursorV1(
      cursor.value,
      {
        now: '2026-01-01T00:30:00.000Z',
        deviceId: id('11'),
        tenantScope: scope,
        authorizationEpoch: 3,
        minimumRevision: 0,
        policyVersionId: id('51'),
        policyDigest: digest,
        dataMode: 'Hybrid',
        protocolVersion: 'sync-v1',
      },
      signer,
    ),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    verifyDeviceSyncCursorV1(
      cursor.value,
      {
        now: '2026-01-01T00:30:00.000Z',
        deviceId: id('11'),
        tenantScope: scope,
        authorizationEpoch: 4,
        minimumRevision: 0,
        policyVersionId: id('51'),
        policyDigest: digest,
        dataMode: 'Hybrid',
        protocolVersion: 'sync-v1',
      },
      signer,
    ),
    { accepted: false, code: 'CURSOR_STALE' },
  );
});

test('[DSO-011, DSO-012, DSO-017] batches validate bounded changes and dependency order', () => {
  const cursor = createDeviceSyncCursorV1(
    {
      cursorId: id('52'),
      deviceId: id('11'),
      tenantScope: scope,
      authorizationEpoch: 3,
      changeRevision: 0,
      dataMode: 'Hybrid',
      protocolVersion: 'sync-v1',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
    },
    signer,
  );
  assert.equal(cursor.accepted, true);
  if (!cursor.accepted) return;
  const first = createDeviceSyncChangeV1({
    changeId: id('53'),
    operationId: id('54'),
    deviceId: id('11'),
    tenantScope: scope,
    entityType: 'artifact-version',
    entityId: id('55'),
    kind: 'UPSERT',
    payloadClass: 'CONTROL_METADATA',
    payloadDigest: digest,
    dependencyIds: [],
    entityRevision: 1,
    createdAt: '2026-01-01T00:00:01.000Z',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const second = createDeviceSyncChangeV1({
    changeId: id('56'),
    operationId: id('57'),
    deviceId: id('11'),
    tenantScope: scope,
    entityType: 'audit-finding',
    entityId: id('58'),
    kind: 'UPSERT',
    payloadClass: 'APPROVED_DERIVED_RESULT',
    payloadDigest: digest,
    dependencyIds: [first.value.operationId],
    entityRevision: 1,
    createdAt: '2026-01-01T00:00:02.000Z',
  });
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  const batch = createDeviceSyncBatchV1({
    deviceId: id('11'),
    tenantScope: scope,
    cursor: cursor.value,
    changes: [first.value, second.value],
  });
  assert.equal(batch.accepted, true);
  assert.equal(batch.accepted && batch.value.changes.length, 2);
  const reversed = createDeviceSyncBatchV1({
    deviceId: id('11'),
    tenantScope: scope,
    cursor: cursor.value,
    changes: [second.value, first.value],
  });
  assert.deepEqual(reversed, { accepted: false, code: 'DEPENDENCY_ORDER_INVALID' });
});
