import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateFolderProjectionConsent,
  FolderProjectionController,
} from '../../../src/features/dda/source-catalog/api/folder-projection.controller.js';

void test('[DSO-015][DSO-021] LOCAL mode never allows folder projection transfer', () => {
  const result = evaluateFolderProjectionConsent({
    tenantScope: {
      organizationId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
    } as never,
    bindingId: '00000000-0000-4000-8000-000000000901',
    sourceId: '00000000-0000-4000-8000-000000000902',
    dataMode: 'LOCAL',
    consentGranted: true,
    contentAllowed: true,
  });
  assert.deepEqual(result, { accepted: false, code: 'LOCAL_MODE_DENIED' });
});

void test('[DSO-015] Cloud/Hybrid requires explicit consent and cancels cleanly', () => {
  assert.equal(
    evaluateFolderProjectionConsent({
      tenantScope: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      } as never,
      bindingId: '00000000-0000-4000-8000-000000000901',
      sourceId: '00000000-0000-4000-8000-000000000902',
      dataMode: 'CLOUD',
      consentGranted: false,
      contentAllowed: true,
    }).accepted,
    false,
  );

  assert.deepEqual(
    evaluateFolderProjectionConsent({
      tenantScope: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      } as never,
      bindingId: '00000000-0000-4000-8000-000000000901',
      sourceId: '00000000-0000-4000-8000-000000000902',
      dataMode: 'HYBRID',
      consentGranted: true,
      contentAllowed: true,
      projectionCancelled: true,
    }),
    { accepted: false, code: 'PROJECTION_CANCELLED' },
  );

  const controller = new FolderProjectionController();
  const accepted = controller.consent({
    tenantScope: {
      organizationId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
    } as never,
    bindingId: '00000000-0000-4000-8000-000000000901',
    sourceId: '00000000-0000-4000-8000-000000000902',
    dataMode: 'CLOUD',
    consentGranted: true,
    contentAllowed: true,
  });
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(accepted.transferAllowed, true);
});
