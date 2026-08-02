import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvidenceAccessGrantV1 } from '../dist/evidence-grant/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const base = {
  grantId: '00000000-0000-4000-8000-000000000010',
  evidenceId: '00000000-0000-4000-8000-000000000011',
  artifactVersionId: '00000000-0000-4000-8000-000000000012',
  tenantScope: scope,
  recipientDeviceId: '00000000-0000-4000-8000-000000000013',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-01T00:05:00.000Z',
  authorizationEpoch: 2,
  artifactDataMode: 'Hybrid',
  sourceState: 'AVAILABLE',
};

void test('[IAE-005] grants are short-lived and bind an action to a device epoch', () => {
  const result = createEvidenceAccessGrantV1({ ...base, action: 'EXCERPT' });
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.recipientDeviceId, base.recipientDeviceId);
    assert.equal(result.value.authorizationEpoch, 2);
    assert.equal(result.value.maxExcerptBytes, 512);
  }
});

void test('[IAE-006] Local evidence cannot create excerpt or cloud-open grants', () => {
  assert.deepEqual(
    createEvidenceAccessGrantV1({ ...base, action: 'EXCERPT', artifactDataMode: 'Local' }),
    { accepted: false, code: 'LOCAL_CONTENT_LEAK' },
  );
  const local = createEvidenceAccessGrantV1({
    ...base,
    action: 'OPEN_ON_DEVICE',
    artifactDataMode: 'Local',
  });
  assert.equal(local.accepted, true);
  if (local.accepted) assert.equal(local.value.action, 'OPEN_ON_DEVICE');
});

void test('[IAE-005] grants reject long expiry and unavailable excerpts', () => {
  assert.deepEqual(
    createEvidenceAccessGrantV1({
      ...base,
      action: 'COORDINATE',
      expiresAt: '2026-01-01T00:16:00.000Z',
    }),
    { accepted: false, code: 'EXPIRY_TOO_LONG' },
  );
  assert.deepEqual(
    createEvidenceAccessGrantV1({ ...base, action: 'EXCERPT', sourceState: 'SOURCE_OFFLINE' }),
    { accepted: false, code: 'SOURCE_UNAVAILABLE' },
  );
});
