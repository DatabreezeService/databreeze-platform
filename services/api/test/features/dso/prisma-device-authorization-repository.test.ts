import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuthorizationSnapshotV1,
  createOpaqueDeviceGrantV1,
  type AuthorizationSnapshotV1,
  type OpaqueDeviceGrantV1,
} from '@databreeze/domain/device-authorization/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDeviceAuthorizationRepositoryAdapter,
  type DeviceAuthorizationDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-device-authorization-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000501';
const workspaceId = '00000000-0000-4000-8000-000000000502';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000503';
const deviceId = '00000000-0000-4000-8000-000000000504';
const userId = '00000000-0000-4000-8000-000000000505';
const snapshotId = '00000000-0000-4000-8000-000000000506';
const grantId = '00000000-0000-4000-8000-000000000507';
const digest = 'a'.repeat(64);

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid id');
  return parsed.value;
}

function context(candidateWorkspaceId: string, idempotencyKey: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000508',
    correlationId: '00000000-0000-4000-8000-000000000509',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    idempotencyKey,
    authorizationEpoch: 2,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function snapshot(): AuthorizationSnapshotV1 {
  const created = createAuthorizationSnapshotV1(
    {
      snapshotId,
      deviceId,
      userId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      authorizationEpoch: 2,
      revision: 1,
      permissions: ['artifact.read'],
      dataMode: 'Hybrid',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
    },
    { sign: (payload) => `sig:${payload}`, verify: () => true },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid snapshot');
  return created.value;
}

function grant(): OpaqueDeviceGrantV1 {
  const created = createOpaqueDeviceGrantV1({
    grantId,
    deviceId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    bindingId: '00000000-0000-4000-8000-000000000510',
    capabilityDigest: digest,
    authorizationEpoch: 2,
    effects: ['READ', 'WRITE_DERIVATIVE'],
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid grant');
  return created.value;
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
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const entries = Object.entries(orderBy);
      const [field, direction] = entries[0] ?? ['id', 'asc'];
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
  };
}

function client(): DeviceAuthorizationDatabaseClientV1 {
  const snapshotRows: Record<string, unknown>[] = [];
  const grantRows: Record<string, unknown>[] = [];
  const database = {
    deviceAuthorizationSnapshotRecord: delegate(snapshotRows),
    deviceGrantRecord: delegate(grantRows),
    async $transaction<TValue>(work: (transaction: DeviceAuthorizationDatabaseClientV1) => Promise<TValue>) {
      return work(database as unknown as DeviceAuthorizationDatabaseClientV1);
    },
  };
  return database as unknown as DeviceAuthorizationDatabaseClientV1;
}

void test('[IAM-020, DSO-005, IAM-009] Prisma device authorization adapter persists grants and hides sibling scopes', async () => {
  const repository = new PrismaDeviceAuthorizationRepositoryAdapter(client());
  await repository.saveSnapshot(context(workspaceId, 'snapshot'), snapshot());
  await repository.saveGrant(context(workspaceId, 'grant'), grant());
  assert.equal((await repository.findSnapshot(context(workspaceId, 'find-snapshot'), id(deviceId)))?.snapshotId, id(snapshotId));
  assert.equal((await repository.findGrant(context(workspaceId, 'find-grant'), id(grantId)))?.grantId, id(grantId));
  assert.equal(await repository.findGrant(context(siblingWorkspaceId, 'sibling'), id(grantId)), undefined);
  const revoked = await repository.revokeGrant(context(workspaceId, 'revoke'), id(grantId), 1);
  assert.equal(revoked?.status, 'REVOKED');
  assert.equal((await repository.findGrant(context(workspaceId, 'revoked'), id(grantId)))?.revision, 2);
});
