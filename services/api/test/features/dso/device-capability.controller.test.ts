import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000631';
const workspaceId = '00000000-0000-4000-8000-000000000632';
const deviceId = '00000000-0000-4000-8000-000000000633';
const capabilityId = '00000000-0000-4000-8000-000000000634';
const grantId = '00000000-0000-4000-8000-000000000635';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000636',
    correlationId: '00000000-0000-4000-8000-000000000637',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: 'capability-http',
    authorizationEpoch: 2,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

void test('[DSO-002, DSO-003, DSO-005] HTTP capability and grant endpoints remain content-free', async () => {
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const reported = await app.inject({
      method: 'POST',
      url: `/v1/devices/${deviceId}/capabilities`,
      payload: {
        capabilityId,
        type: 'APPROVED_FOLDER',
        opaqueLocalHandle: 'folder-opaque-1',
        constraintDigest: 'c'.repeat(64),
        reportedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(reported.statusCode, 200);
    assert.equal(reported.json().accepted, true);
    assert.doesNotMatch(reported.body, /C:\\|bytes|preview|source/u);

    const listed = await app.inject({ method: 'GET', url: `/v1/devices/${deviceId}/capabilities` });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().value.length, 1);

    const issued = await app.inject({
      method: 'POST',
      url: '/v1/devices/grants',
      payload: {
        grantId,
        deviceId,
        capabilityId,
        workspaceId,
        authorizationEpoch: 2,
        allowedActionTypes: ['FOLDER_AUDIT'],
        allowedDataClassifications: ['INTERNAL'],
        synchronizationPayloadClasses: ['CONTROL_METADATA'],
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
    });
    assert.equal(issued.statusCode, 200);
    assert.equal(issued.json().accepted, true);

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/devices/grants/${grantId}/revoke`,
      payload: { expectedRevision: 1 },
    });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().value.status, 'REVOKED');
  } finally {
    await app.close();
  }
});
