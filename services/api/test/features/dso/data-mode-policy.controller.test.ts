import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000651';
const workspaceId = '00000000-0000-4000-8000-000000000652';
const policyId = '00000000-0000-4000-8000-000000000653';
const versionId = '00000000-0000-4000-8000-000000000654';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000655',
    correlationId: '00000000-0000-4000-8000-000000000656',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: 'policy-http',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function jsonObject(response: { json(): unknown }): Record<string, unknown> {
  const value = response.json();
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

void test('[DSO-008, DSO-018, DSO-026] HTTP data-mode policy surface is read-only until guarded activation', async () => {
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const legacyPublish = await app.inject({
      method: 'POST',
      url: '/v1/data-mode-policies',
      payload: {
        policyId,
        policyVersionId: versionId,
        revision: 1,
        mode: 'HYBRID',
        allowedPayloadClasses: {
          PUBLIC: ['CONTROL_METADATA'],
          INTERNAL: ['CONTROL_METADATA'],
          CONFIDENTIAL: ['CONTROL_METADATA'],
          RESTRICTED: [],
        },
        allowedPlacementKinds: ['LOCAL', 'CLOUD'],
        allowedExecutorClasses: ['DESKTOP', 'CLOUD'],
        allowedDestinationClasses: ['WEB', 'DESKTOP'],
        canonicalHash: 'f'.repeat(64),
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(legacyPublish.statusCode, 404);
    const listed = await app.inject({ method: 'GET', url: `/v1/data-mode-policies/${policyId}` });
    assert.equal(listed.statusCode, 200);
    const listedBody = jsonObject(listed);
    const listedValue = listedBody['value'];
    assert.ok(Array.isArray(listedValue));
    assert.equal(listedValue.length, 0);
  } finally {
    await app.close();
  }
});
