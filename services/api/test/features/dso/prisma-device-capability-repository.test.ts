import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceCapabilityV1,
  createDeviceGrantV1,
  type DeviceCapabilityV1,
  type DeviceGrantV1,
} from '@databreeze/domain/device-capability/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDeviceCapabilityRepositoryAdapter,
  type DeviceCapabilityDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-device-capability-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000601';
const workspaceId = '00000000-0000-4000-8000-000000000602';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000603';
const deviceId = '00000000-0000-4000-8000-000000000604';
const capabilityId = '00000000-0000-4000-8000-000000000605';
const grantId = '00000000-0000-4000-8000-000000000606';
const digest = 'b'.repeat(64);

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid id');
  return parsed.value;
}

function context(candidateWorkspaceId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000607',
    correlationId: '00000000-0000-4000-8000-000000000608',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    idempotencyKey,
    authorizationEpoch: 3,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function capability(): DeviceCapabilityV1 {
  const result = createDeviceCapabilityV1({
    capabilityId,
    deviceId,
    organizationId,
    type: 'APPROVED_FOLDER',
    opaqueLocalHandle: 'folder-binding-1',
    constraintDigest: digest,
    reportedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid capability');
  return result.value;
}

function grant(): DeviceGrantV1 {
  const result = createDeviceGrantV1({
    grantId,
    deviceId,
    organizationId,
    workspaceId,
    capabilityId,
    authorizationEpoch: 3,
    allowedActionTypes: ['FOLDER_AUDIT'],
    allowedDataClassifications: ['INTERNAL'],
    synchronizationPayloadClasses: ['CONTROL_METADATA'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid grant');
  return result.value;
}

function delegate(rows: Record<string, unknown>[], forceRevisionConflict = false) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findUnique({ where }: { readonly where: { readonly id: string } }) {
      return Promise.resolve(rows.find((row) => row['id'] === where.id) ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const [field, direction] = Object.entries(orderBy)[0] ?? ['id', 'asc'];
      return Promise.resolve(
        rows
          .filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
          .sort((left, right) => {
            const comparison = String(left[field]).localeCompare(String(right[field]));
            return direction === 'desc' ? -comparison : comparison;
          }),
      );
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
    updateMany({
      where,
      data,
    }: {
      readonly where: { readonly id: string; readonly revision: number };
      readonly data: Record<string, unknown>;
    }) {
      if (forceRevisionConflict) return Promise.resolve({ count: 0 });
      const index = rows.findIndex(
        (row) => row['id'] === where.id && row['revision'] === where.revision,
      );
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data };
      return Promise.resolve({ count: 1 });
    },
  };
}

function client(
  options: { readonly forceRevisionConflict?: boolean } = {},
): DeviceCapabilityDatabaseClientV1 {
  const capabilityRows: Record<string, unknown>[] = [];
  const grantRows: Record<string, unknown>[] = [];
  const database = {
    deviceCapabilityRecord: delegate(capabilityRows, options.forceRevisionConflict),
    deviceOperationalGrantRecord: delegate(grantRows, options.forceRevisionConflict),
    async $transaction<TValue>(
      work: (transaction: DeviceCapabilityDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database as unknown as DeviceCapabilityDatabaseClientV1);
    },
  };
  return database as unknown as DeviceCapabilityDatabaseClientV1;
}

void test('[DSO-002, DSO-003, IAM-009] Prisma capability adapter persists and isolates capabilities', async () => {
  const repository = new PrismaDeviceCapabilityRepositoryAdapter(client());
  await repository.saveCapability(context(workspaceId, 'cap-save'), capability());
  assert.equal(
    (await repository.listCapabilities(context(workspaceId, 'cap-list'), id(deviceId))).length,
    1,
  );
  assert.equal(
    (
      await repository.listCapabilities(
        context('00000000-0000-4000-8000-000000000609', 'sibling'),
        id(deviceId),
      )
    ).length,
    1,
  );
});

void test('[DSO-005, DSO-016] Prisma grant adapter hides sibling workspaces and enforces revisions', async () => {
  const repository = new PrismaDeviceCapabilityRepositoryAdapter(client());
  await repository.saveCapability(context(workspaceId, 'cap-save-2'), capability());
  await repository.saveGrant(context(workspaceId, 'grant-save'), grant());
  assert.equal(
    await repository.findGrant(context(siblingWorkspaceId, 'sibling'), id(grantId)),
    undefined,
  );
  await repository.replaceGrant(
    context(workspaceId, 'grant-replace'),
    { ...grant(), status: 'REVOKED', revision: 2 },
    1,
  );
  await assert.rejects(
    repository.replaceGrant(
      context(workspaceId, 'grant-stale'),
      { ...grant(), status: 'EXPIRED', revision: 3 },
      1,
    ),
    /DSO_REVISION_CONFLICT/,
  );
});

void test('[DSO-005, DSO-016] Prisma capability and grant replacements reject database races', async () => {
  const repository = new PrismaDeviceCapabilityRepositoryAdapter(
    client({ forceRevisionConflict: true }),
  );
  await repository.saveCapability(context(workspaceId, 'cap-race-save'), capability());
  await assert.rejects(
    repository.replaceCapability(
      context(workspaceId, 'cap-race-replace'),
      { ...capability(), status: 'PAUSED', revision: 2 },
      1,
    ),
    /DSO_REVISION_CONFLICT/u,
  );
  await repository.saveGrant(context(workspaceId, 'grant-race-save'), grant());
  await assert.rejects(
    repository.replaceGrant(
      context(workspaceId, 'grant-race-replace'),
      { ...grant(), status: 'REVOKED', revision: 2 },
      1,
    ),
    /DSO_REVISION_CONFLICT/u,
  );
});

void test('[DSO-005, DSO-016] Prisma capability and grant replacements require one revision step', async () => {
  const repository = new PrismaDeviceCapabilityRepositoryAdapter(client());
  await repository.saveCapability(context(workspaceId, 'cap-step-save'), capability());
  await assert.rejects(
    repository.replaceCapability(
      context(workspaceId, 'cap-step-replace'),
      { ...capability(), status: 'PAUSED', revision: 1 },
      1,
    ),
    /DSO_REVISION_CONFLICT/u,
  );

  await repository.saveGrant(context(workspaceId, 'grant-step-save'), grant());
  await assert.rejects(
    repository.replaceGrant(
      context(workspaceId, 'grant-step-replace'),
      { ...grant(), status: 'REVOKED', revision: 3 },
      1,
    ),
    /DSO_REVISION_CONFLICT/u,
  );
});
