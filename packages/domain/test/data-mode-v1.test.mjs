import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDataModePolicyVersionV1,
  ensureDataModePolicyNarrowingV1,
  isDataModePayloadAllowedV1,
} from '../dist/data-mode/v1.js';

const ids = {
  policyId: '11111111-1111-4111-8111-111111111111',
  policyVersionId: '22222222-2222-4222-8222-222222222222',
  childVersionId: '33333333-3333-4333-8333-333333333333',
  workspaceId: '44444444-4444-4444-8444-444444444444',
};

function policy(versionId, mode, overrides = {}) {
  return createDataModePolicyVersionV1({
    ...ids,
    policyVersionId: versionId,
    revision: 1,
    mode,
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      INTERNAL: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: ['DESKTOP', 'CLOUD'],
    allowedDestinationClasses: ['WEB', 'DESKTOP'],
    canonicalHash: 'a'.repeat(64),
    publishedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  });
}

test('[DSO-008, DSO-027] creates an immutable, explicit Hybrid payload policy', () => {
  const result = policy(ids.policyVersionId, 'HYBRID');
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(isDataModePayloadAllowedV1(result.value, 'CONFIDENTIAL', 'ORIGINAL_CONTENT'), false);
  assert.equal(isDataModePayloadAllowedV1(result.value, 'PUBLIC', 'APPROVED_DERIVED_RESULT'), true);
  assert.equal(Object.isFrozen(result.value.allowedPayloadClasses), true);
});

test('[DSO-026] a child policy may narrow mode and payloads but never broaden them', () => {
  const parent = policy(ids.policyVersionId, 'HYBRID');
  const child = policy(ids.childVersionId, 'LOCAL', {
    allowedPlacementKinds: ['LOCAL'],
    allowedExecutorClasses: ['DESKTOP'],
    allowedDestinationClasses: ['DESKTOP'],
  });
  assert.equal(parent.accepted && child.accepted, true);
  if (!parent.accepted || !child.accepted) return;
  assert.deepEqual(ensureDataModePolicyNarrowingV1(parent.value, child.value), {
    accepted: true,
    value: true,
  });
  const broader = policy(ids.childVersionId, 'CLOUD');
  assert.equal(broader.accepted, true);
  if (broader.accepted)
    assert.deepEqual(ensureDataModePolicyNarrowingV1(parent.value, broader.value), {
      accepted: false,
      code: 'POLICY_BROADENS_PARENT',
    });
});
