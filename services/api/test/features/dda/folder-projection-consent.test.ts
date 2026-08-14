import assert from 'node:assert/strict';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  evaluateFolderProjectionConsent,
  FolderProjectionController,
} from '../../../src/features/dda/source-catalog/api/folder-projection.controller.js';

const contextResult = createIamTenantContextV1({
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
  },
  actorId: '00000000-0000-4000-8000-000000000003',
  correlationId: '00000000-0000-4000-8000-000000000004',
  idempotencyKey: 'folder-projection-test',
  authorizationEpoch: 1,
});
assert.equal(contextResult.accepted, true);
const context = contextResult.accepted ? contextResult.value : (null as never);
const requestContext = { resolve: () => Promise.resolve(context) };
const request = { headers: { authorization: 'Bearer verified-request' } };

void test('[DSO-015][DSO-021] LOCAL mode never allows folder projection transfer', () => {
  const result = evaluateFolderProjectionConsent({
    bindingId: '00000000-0000-4000-8000-000000000901',
    sourceId: '00000000-0000-4000-8000-000000000902',
    dataMode: 'LOCAL',
    consentGranted: true,
    serverContentAllowed: true,
  });
  assert.deepEqual(result, { accepted: false, code: 'LOCAL_MODE_DENIED' });
});

void test('[DSO-015] Cloud/Hybrid requires explicit consent and cancels cleanly', () => {
  assert.equal(
    evaluateFolderProjectionConsent({
      bindingId: '00000000-0000-4000-8000-000000000901',
      sourceId: '00000000-0000-4000-8000-000000000902',
      dataMode: 'CLOUD',
      consentGranted: false,
      serverContentAllowed: true,
    }).accepted,
    false,
  );

  assert.deepEqual(
    evaluateFolderProjectionConsent({
      bindingId: '00000000-0000-4000-8000-000000000901',
      sourceId: '00000000-0000-4000-8000-000000000902',
      dataMode: 'HYBRID',
      consentGranted: true,
      serverContentAllowed: true,
      projectionCancelled: true,
    }),
    { accepted: false, code: 'PROJECTION_CANCELLED' },
  );
});

void test('[DSO-015, IAM-002] folder controller uses server policy output', async () => {
  const controller = new FolderProjectionController(requestContext, {
    authorize: () =>
      Promise.resolve({
        accepted: true as const,
        dataMode: 'CLOUD' as const,
        contentAllowed: true,
      }),
  });
  const accepted = await controller.consent(request, {
    bindingId: '00000000-0000-4000-8000-000000000901',
    sourceId: '00000000-0000-4000-8000-000000000902',
    dataMode: 'CLOUD',
    consentGranted: true,
  });
  assert.deepEqual(accepted, {
    accepted: true,
    bindingId: '00000000-0000-4000-8000-000000000901',
    sourceId: '00000000-0000-4000-8000-000000000902',
    transferAllowed: true,
  });
});

void test('[DSO-015, IAM-002] client contentAllowed is rejected as authority', async () => {
  const controller = new FolderProjectionController(requestContext, {
    authorize: () =>
      Promise.resolve({
        accepted: true as const,
        dataMode: 'CLOUD' as const,
        contentAllowed: true,
      }),
  });
  await assert.rejects(
    controller.consent(request, {
      bindingId: '00000000-0000-4000-8000-000000000901',
      sourceId: '00000000-0000-4000-8000-000000000902',
      dataMode: 'CLOUD',
      consentGranted: true,
      contentAllowed: true,
    } as never),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 400,
  );
});
