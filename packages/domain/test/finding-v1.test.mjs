import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../dist/finding/v1.js';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  findingId: '00000000-0000-4000-8000-000000000003',
  reviewTaskId: '00000000-0000-4000-8000-000000000004',
  evidenceId: '00000000-0000-4000-8000-000000000005',
};

function findingInput() {
  return {
    findingId: ids.findingId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    sourceSubsystem: 'spreadsheet-auditor',
    findingType: 'formula-outlier',
    fingerprint: 'a'.repeat(64),
    diagnosticDetailRef: 'detail/0001',
    severity: 'HIGH',
    evidenceReferences: [ids.evidenceId],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-026, JRA-027] findings resolve with immutable diagnostic references and review tasks transition explicitly', () => {
  const created = api.createFindingV1(findingInput());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const resolved = api.resolveFindingV1(
    created.value,
    'FIXED',
    '2026-01-01T00:01:00.000Z',
    'repaired copy validated',
  );
  assert.equal(resolved.accepted, true);
  const task = api.createReviewTaskV1({
    reviewTaskId: ids.reviewTaskId,
    findingId: ids.findingId,
    tenantScope: findingInput().tenantScope,
    reason: 'Review repair plan',
    eligibleRole: 'ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(task.accepted, true);
  if (task.accepted) {
    const claimed = api.transitionReviewTaskV1(task.value, 'CLAIMED', 1);
    assert.equal(claimed.accepted, true);
    if (claimed.accepted) assert.equal(claimed.value.revision, 2);
  }
});

void test('[JRA-026, JRA-027] malformed findings and stale review transitions fail closed', () => {
  assert.deepEqual(api.createFindingV1({ ...findingInput(), evidenceReferences: ['not-an-id'] }), {
    accepted: false,
    code: 'INVALID_EVIDENCE',
  });
  const task = api.createReviewTaskV1({
    reviewTaskId: ids.reviewTaskId,
    findingId: ids.findingId,
    tenantScope: findingInput().tenantScope,
    reason: 'Review',
    eligibleRole: 'ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(task.accepted, true);
  if (task.accepted)
    assert.deepEqual(api.transitionReviewTaskV1(task.value, 'CLAIMED', 2), {
      accepted: false,
      code: 'INVALID_REVISION',
    });
});
