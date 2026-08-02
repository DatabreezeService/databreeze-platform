import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeviceSyncCursorV1 } from '@databreeze/domain/device-sync/v1';

import { InMemoryDataModePolicyRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-data-mode-policy-repository.adapter.js';
import { InMemoryDeviceSyncRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-device-sync-repository.adapter.js';
import { DataModePolicyService } from '../../../src/features/dso/application/data-mode-policy.service.js';
import { DeviceSyncService } from '../../../src/features/dso/application/device-sync.service.js';
import type { DeviceSyncAuthorizationPortV1 } from '../../../src/features/dso/application/device-sync-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const deviceId = '00000000-0000-4000-8000-000000000020';
const operationId = '00000000-0000-4000-8000-000000000021';
const entityId = '00000000-0000-4000-8000-000000000022';
const packageId = '00000000-0000-4000-8000-000000000023';
const receiptId = '00000000-0000-4000-8000-000000000024';
const conflictId = '00000000-0000-4000-8000-000000000025';
const policyId = '00000000-0000-4000-8000-000000000026';
const policyVersionId = '00000000-0000-4000-8000-000000000027';
const digest = 'a'.repeat(64);
const signer = {
  sign: (payload: string) => `sig:${payload}`,
  verify: (payload: string, signature: string) => signature === `sig:${payload}`,
};
const grantId = '00000000-0000-4000-8000-000000000036';

const authorization: DeviceSyncAuthorizationPortV1 = {
  authorize: (_context, input) =>
    Promise.resolve(
      input.grantId === grantId
        ? { accepted: true as const, value: true as const }
        : { accepted: false as const, code: 'GRANT_SCOPE_DENIED' as const },
    ),
};

function context(scopeWorkspaceId: string, idempotencyKey: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: scopeWorkspaceId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function operationInput(overrides: Record<string, unknown> = {}) {
  return {
    operationId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entityType: 'artifact-version',
    entityId,
    kind: 'UPSERT',
    payloadClass: 'CONTROL_METADATA',
    payloadDigest: digest,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function packageInput(overrides: Record<string, unknown> = {}) {
  return {
    packageId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    purpose: 'offline-review',
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    itemDigests: [digest],
    packageDigest: digest,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

void test('[DSO-011, DSO-012, DSO-014] sync enqueue is idempotent and tenant scoped', async () => {
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter(), undefined, authorization);
  const first = await service.enqueue(context(workspaceId, 'sync-1'), operationInput());
  const replay = await service.enqueue(context(workspaceId, 'sync-1'), operationInput());
  assert.equal(first.accepted, true);
  assert.deepEqual(replay, first);
  const conflict = await service.enqueue(
    context(workspaceId, 'sync-1'),
    operationInput({ payloadDigest: 'b'.repeat(64) }),
  );
  assert.deepEqual(conflict, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  const sibling = await service.enqueue(
    context(siblingWorkspaceId, 'sync-sibling'),
    operationInput({ operationId: '00000000-0000-4000-8000-000000000026' }),
  );
  assert.deepEqual(sibling, { accepted: false, code: 'TENANT_SCOPE_DENIED' });
});

void test('[DSO-016, DSO-018] transitions use optimistic revisions and explicit conflicts', async () => {
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter());
  const created = await service.enqueue(context(workspaceId, 'sync-transition'), operationInput());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const accepted = await service.transition(
    context(workspaceId, 'sync-accept', 1),
    operationId,
    'ACCEPT',
    '2026-01-01T00:00:01.000Z',
  );
  assert.equal(accepted.accepted, true);
  const stale = await service.transition(
    context(workspaceId, 'sync-stale', 1),
    operationId,
    'APPLY',
    '2026-01-01T00:00:02.000Z',
  );
  assert.deepEqual(stale, { accepted: false, code: 'REVISION_CONFLICT' });
  const conflict = await service.recordConflict(context(workspaceId, 'sync-conflict'), {
    conflictId,
    operationId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entityType: 'artifact-version',
    entityId,
    reason: 'REVISION_MISMATCH',
    expectedRevision: 2,
    actualRevision: 3,
    detectedAt: '2026-01-01T00:00:03.000Z',
  });
  assert.equal(conflict.accepted, true);
  assert.equal((await service.listConflicts(context(workspaceId, 'sync-conflict-list'))).length, 1);
});

void test('[DSO-019, DSO-020, DSO-021] strict-Local handoff binds package and receipt digests', async () => {
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter());
  const issued = await service.issueStrictLocalPackage(
    context(workspaceId, 'package-issue'),
    packageInput(),
  );
  assert.equal(issued.accepted, true);
  const receipt = await service.recordTransferReceipt(context(workspaceId, 'package-receipt'), {
    receiptId,
    packageId,
    deviceId,
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    packageDigest: digest,
    receivedAt: '2026-01-01T00:30:00.000Z',
    manifestVerified: true,
    status: 'ACCEPTED',
  });
  assert.equal(receipt.accepted, true);
  const tampered = await service.recordTransferReceipt(context(workspaceId, 'package-tamper'), {
    receiptId: '00000000-0000-4000-8000-000000000028',
    packageId,
    deviceId,
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    packageDigest: 'b'.repeat(64),
    receivedAt: '2026-01-01T00:31:00.000Z',
    manifestVerified: false,
    status: 'QUARANTINED',
  });
  assert.deepEqual(tampered, { accepted: false, code: 'RECEIPT_MISMATCH' });
});

void test('[DSO-007, DSO-008] policy denies payloads that are not approved for the classification', async () => {
  const policies = new InMemoryDataModePolicyRepositoryAdapter();
  const policyService = new DataModePolicyService(policies);
  const published = await policyService.publish(context(workspaceId, 'policy-publish'), {
    policyId,
    policyVersionId,
    organizationId,
    workspaceId,
    revision: 1,
    mode: 'LOCAL',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA'],
      INTERNAL: ['CONTROL_METADATA'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: ['LOCAL'],
    allowedExecutorClasses: ['DESKTOP'],
    allowedDestinationClasses: ['DESKTOP'],
    canonicalHash: digest,
    publishedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(published.accepted, true);
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter(), policies);
  const result = await service.enqueue(
    context(workspaceId, 'policy-denied'),
    operationInput({
      payloadClass: 'APPROVED_DERIVED_RESULT',
      policyVersionId,
      classification: 'INTERNAL',
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'POLICY_DENIED' });
});

void test('[DSO-007, DSO-014, DSO-017] pull returns an opaque, ordered batch and advances its cursor', async () => {
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter(), undefined, authorization);
  const created = await service.enqueue(context(workspaceId, 'pull-seed'), operationInput());
  assert.equal(created.accepted, true);
  const cursor = createDeviceSyncCursorV1(
    {
      cursorId: '00000000-0000-4000-8000-000000000030',
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      authorizationEpoch: 1,
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
  const pulled = await service.pull(context(workspaceId, 'pull-read'), {
    deviceId,
    cursor: cursor.value,
    now: '2026-01-01T00:00:01.000Z',
    minimumRevision: 0,
    signer,
    grantId,
    nextCursorId: '00000000-0000-4000-8000-000000000031',
    pageSize: 10,
  });
  assert.equal(pulled.accepted, true);
  if (!pulled.accepted) return;
  assert.equal(pulled.value.changes.length, 1);
  const [pulledChange] = pulled.value.changes;
  assert.ok(pulledChange);
  assert.equal('encryptedPayload' in pulledChange, false);
  assert.equal(pulled.value.nextCursor?.changeRevision, 1);
});

void test('[DSO-011, DSO-014] push derives idempotency per change and rejects a stale cursor', async () => {
  const service = new DeviceSyncService(new InMemoryDeviceSyncRepositoryAdapter(), undefined, authorization);
  const cursor = createDeviceSyncCursorV1(
    {
      cursorId: '00000000-0000-4000-8000-000000000032',
      deviceId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      authorizationEpoch: 1,
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
  const change = {
    changeId: '00000000-0000-4000-8000-000000000033',
    operationId: '00000000-0000-4000-8000-000000000034',
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entityType: 'artifact-version',
    entityId: '00000000-0000-4000-8000-000000000035',
    kind: 'UPSERT' as const,
    payloadClass: 'CONTROL_METADATA' as const,
    payloadDigest: digest,
    dependencyIds: [],
    entityRevision: 1,
    createdAt: '2026-01-01T00:00:01.000Z',
  };
  const batch = {
    schemaVersion: 1 as const,
    deviceId,
    tenantScope: { scopeType: 'workspace' as const, organizationId, workspaceId },
    cursor: cursor.value,
    changes: [change],
  };
  const pushed = await service.push(context(workspaceId, 'push-base'), {
    batch,
    now: '2026-01-01T00:00:02.000Z',
    minimumRevision: 0,
    signer,
    grantId,
  });
  assert.equal(pushed.accepted, true);
  if (!pushed.accepted) return;
  assert.equal(pushed.value.items.length, 1);
  const [pushedItem] = pushed.value.items;
  assert.ok(pushedItem);
  assert.equal(pushedItem.result.accepted, true);
  const staleContext = context(workspaceId, 'push-stale');
  const stale = await service.push(
    { ...staleContext, authorizationEpoch: 2 },
    { batch, now: '2026-01-01T00:00:02.000Z', minimumRevision: 0, signer, grantId },
  );
  assert.deepEqual(stale, { accepted: false, code: 'CURSOR_STALE' });
});
