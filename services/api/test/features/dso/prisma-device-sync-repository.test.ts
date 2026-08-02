import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  transitionDeviceSyncOperationV1,
  type DeviceSyncConflictV1,
  type DeviceSyncOperationV1,
  type DeviceTransferReceiptV1,
  type StrictLocalPackageManifestV1,
} from '@databreeze/domain/device-sync/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDeviceSyncRepositoryAdapter,
  type DeviceSyncDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-device-sync-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000301';
const workspaceId = '00000000-0000-4000-8000-000000000302';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000303';
const deviceId = '00000000-0000-4000-8000-000000000304';
const operationId = '00000000-0000-4000-8000-000000000305';
const entityId = '00000000-0000-4000-8000-000000000306';
const conflictId = '00000000-0000-4000-8000-000000000307';
const packageId = '00000000-0000-4000-8000-000000000308';
const receiptId = '00000000-0000-4000-8000-000000000309';
const digest = 'a'.repeat(64);

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid id fixture');
  return parsed.value;
}

function context(candidateWorkspaceId: string, idempotencyKey: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000310',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000311',
    idempotencyKey,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context fixture');
  return result.value;
}

function operation(status: DeviceSyncOperationV1['status'] = 'QUEUED'): DeviceSyncOperationV1 {
  const created = createDeviceSyncOperationV1({
    operationId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entityType: 'artifact-version',
    entityId,
    kind: 'UPSERT',
    payloadClass: 'CONTROL_METADATA',
    payloadDigest: digest,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid operation fixture');
  if (status === 'QUEUED') return created.value;
  const accepted = transitionDeviceSyncOperationV1(
    created.value,
    'ACCEPT',
    '2026-01-01T00:00:01.000Z',
  );
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) throw new Error('invalid accepted fixture');
  return accepted.value;
}

function conflict(): DeviceSyncConflictV1 {
  const created = createDeviceSyncConflictV1({
    conflictId,
    operationId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entityType: 'artifact-version',
    entityId,
    reason: 'REVISION_MISMATCH',
    expectedRevision: 2,
    actualRevision: 3,
    detectedAt: '2026-01-01T00:00:02.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid conflict fixture');
  return created.value;
}

function manifest(): StrictLocalPackageManifestV1 {
  const created = createStrictLocalPackageManifestV1({
    packageId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    purpose: 'offline-review',
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    itemDigests: [digest],
    packageDigest: digest,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid package fixture');
  return created.value;
}

function receipt(): DeviceTransferReceiptV1 {
  const created = createDeviceTransferReceiptV1({
    receiptId,
    packageId,
    deviceId,
    destinationClass: 'USER_CARRIED_ENCRYPTED_PACKAGE',
    packageDigest: digest,
    receivedAt: '2026-01-01T00:30:00.000Z',
    manifestVerified: true,
    status: 'ACCEPTED',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid receipt fixture');
  return created.value;
}

function matches(row: Record<string, unknown>, where: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function delegate(rows: Record<string, unknown>[]) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findUnique({ where }: { readonly where: { readonly id: string } }) {
      return Promise.resolve(rows.find((row) => row['id'] === where.id) ?? null);
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(rows.find((row) => matches(row, where)) ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const entries = Object.entries(orderBy);
      const sorted = rows
        .filter((row) => matches(row, where))
        .sort((left, right) => {
          const [field, direction] = entries[0] ?? ['id', 'asc'];
          const leftValue = left[field];
          const rightValue = right[field];
          const leftTime = leftValue instanceof Date ? leftValue.getTime() : String(leftValue);
          const rightTime = rightValue instanceof Date ? rightValue.getTime() : String(rightValue);
          return (
            (leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0) *
            (direction === 'desc' ? -1 : 1)
          );
        });
      return Promise.resolve(sorted);
    },
    update({
      where,
      data,
    }: {
      readonly where: { readonly id: string };
      readonly data: Record<string, unknown>;
    }) {
      const index = rows.findIndex((row) => row['id'] === where.id);
      if (index < 0) throw new Error('row not found');
      rows[index] = { ...rows[index], ...data };
      return Promise.resolve(rows[index]);
    },
  };
}

function client(): DeviceSyncDatabaseClientV1 {
  const operationRows: Record<string, unknown>[] = [];
  const conflictRows: Record<string, unknown>[] = [];
  const packageRows: Record<string, unknown>[] = [];
  const receiptRows: Record<string, unknown>[] = [];
  const database = {
    deviceSyncOperationRecord: delegate(operationRows),
    deviceSyncConflictRecord: delegate(conflictRows),
    strictLocalPackageManifestRecord: delegate(packageRows),
    deviceTransferReceiptRecord: delegate(receiptRows),
    async $transaction<TValue>(work: (transaction: DeviceSyncDatabaseClientV1) => Promise<TValue>) {
      return work(database as unknown as DeviceSyncDatabaseClientV1);
    },
  };
  return database as unknown as DeviceSyncDatabaseClientV1;
}

void test('[DSO-011, DSO-014, IAM-009] Prisma DSO adapter persists revisions and filters sibling scopes', async () => {
  const repository = new PrismaDeviceSyncRepositoryAdapter(client());
  const first = operation();
  await repository.saveOperation(context(workspaceId, 'operation-save'), first);
  await repository.saveOperation(context(workspaceId, 'operation-replay'), first);
  const accepted = transitionDeviceSyncOperationV1(first, 'ACCEPT', '2026-01-01T00:00:01.000Z');
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  await repository.saveOperation(context(workspaceId, 'operation-accept', 1), accepted.value, {
    expectedRevision: 1,
  });
  assert.equal(
    (await repository.findOperation(context(workspaceId, 'operation-find'), id(operationId)))
      ?.status,
    'ACCEPTED',
  );
  assert.equal(
    (await repository.listOperations(context(siblingWorkspaceId, 'operation-sibling'))).length,
    0,
  );
});

void test('[DSO-018, DSO-019, DSO-021] Prisma DSO adapter keeps conflict and transfer records immutable', async () => {
  const repository = new PrismaDeviceSyncRepositoryAdapter(client());
  const current = operation('ACCEPTED');
  await repository.saveOperation(context(workspaceId, 'record-operation'), current);
  await repository.saveConflict(context(workspaceId, 'record-conflict'), conflict());
  await repository.saveConflict(context(workspaceId, 'record-conflict-replay'), conflict());
  assert.equal((await repository.listConflicts(context(workspaceId, 'list-conflicts'))).length, 1);
  await repository.savePackage(context(workspaceId, 'record-package'), manifest());
  await repository.saveReceipt(context(workspaceId, 'record-receipt'), receipt());
  assert.equal(
    (await repository.findReceipt(context(workspaceId, 'find-receipt'), id(receiptId)))
      ?.manifestVerified,
    true,
  );
  await assert.rejects(
    repository.saveReceipt(context(siblingWorkspaceId, 'sibling-receipt'), receipt()),
    /DSO_SCOPE_NARROWING_REQUIRED/u,
  );
});
