import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeviceSyncCursorV1 } from '@databreeze/domain/device-sync/v1';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDeviceSyncRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-device-sync-repository.adapter.js';
import type { DeviceSyncAuthorizationPortV1 } from '../../../src/features/dso/application/device-sync-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000101';
const workspaceId = '00000000-0000-4000-8000-000000000102';
const deviceId = '00000000-0000-4000-8000-000000000103';
const operationId = '00000000-0000-4000-8000-000000000104';
const entityId = '00000000-0000-4000-8000-000000000105';
const grantId = '00000000-0000-4000-8000-000000000110';
const signer = {
  sign: (payload: string) => `sig:${payload}`,
  verify: (payload: string, signature: string) => signature === `sig:${payload}`,
};
const authorization: DeviceSyncAuthorizationPortV1 = {
  authorize: () => Promise.resolve({ accepted: true, value: true }),
};

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000106',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000107',
    idempotencyKey: 'http-sync-operation',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid DSO context');
  return result.value;
}

void test('[DSO-011, DSO-014] HTTP sync endpoints return opaque scoped operation state', async () => {
  const repository = new InMemoryDeviceSyncRepositoryAdapter();
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    deviceSyncRepository: repository,
    requestTenantContext,
    deviceSyncCursorSigner: signer,
    deviceSyncAuthorization: authorization,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/sync/operations',
      payload: {
        operationId,
        deviceId,
        tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
        entityType: 'artifact-version',
        entityId,
        kind: 'UPSERT',
        payloadClass: 'CONTROL_METADATA',
        payloadDigest: 'a'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().accepted, true);
    assert.doesNotMatch(response.body, /path|bytes|preview|secret/u);

    const listed = await app.inject({ method: 'GET', url: '/v1/devices/sync/operations' });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().length, 1);

    const cursor = createDeviceSyncCursorV1(
      {
        cursorId: '00000000-0000-4000-8000-000000000108',
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
    const pulled = await app.inject({
      method: 'POST',
      url: '/v1/devices/sync/pull',
      payload: {
        deviceId,
        cursor: cursor.value,
        grantId,
        now: '2026-01-01T00:00:01.000Z',
        minimumRevision: 0,
        nextCursorId: '00000000-0000-4000-8000-000000000109',
      },
    });
    assert.equal(pulled.statusCode, 200);
    assert.equal(pulled.json().accepted, true);
    assert.equal(pulled.json().value.changes.length, 1);
  } finally {
    await app.close();
  }
});

void test('[DSO-014] HTTP sync validation rejects unknown or unsafe fields', async () => {
  const { app } = await createApiApplication({
    deviceSyncRepository: new InMemoryDeviceSyncRepositoryAdapter(),
    requestTenantContext: { resolve: () => Promise.resolve(context()) },
    deviceSyncCursorSigner: signer,
    deviceSyncAuthorization: authorization,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/sync/operations',
      payload: {
        operationId,
        deviceId,
        tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
        entityType: 'artifact-version',
        entityId,
        kind: 'UPSERT',
        payloadClass: 'CONTROL_METADATA',
        payloadDigest: 'a'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
        localPath: 'C:\\private\\source.xlsx',
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'VALIDATION_FAILED');
    assert.doesNotMatch(response.body, /private|source\.xlsx/u);
  } finally {
    await app.close();
  }
});
