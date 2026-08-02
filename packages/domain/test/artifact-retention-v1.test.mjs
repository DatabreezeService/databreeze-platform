import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeArtifactDeletionV1,
  blockArtifactDeletionV1,
  createArtifactDeletionRequestV1,
} from '../dist/artifact-retention/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000701',
  workspaceId: '00000000-0000-4000-8000-000000000702',
};
const base = {
  requestId: '00000000-0000-4000-8000-000000000703',
  artifactVersionId: '00000000-0000-4000-8000-000000000704',
  tenantScope: scope,
  requestedBy: '00000000-0000-4000-8000-000000000705',
  requestedAt: '2026-01-03T00:00:00.000Z',
};

void test('[IAE-016, IAE-021] deletion authorization requires eligible retention and recent MFA', () => {
  const request = createArtifactDeletionRequestV1(base);
  assert.equal(request.accepted, true);
  if (!request.accepted) return;
  const blocked = blockArtifactDeletionV1(request.value, {
    eligible: false,
    blockers: ['LEGAL_HOLD'],
    evaluatedAt: '2026-01-03T00:00:00.000Z',
  });
  assert.deepEqual(blocked, {
    accepted: true,
    value: { ...request.value, state: 'BLOCKED', blockers: ['LEGAL_HOLD'], revision: 2 },
  });
  if (!blocked.accepted) return;
  assert.deepEqual(
    authorizeArtifactDeletionV1(
      blocked.value,
      { eligible: true, blockers: [], evaluatedAt: '2026-01-04T00:00:00.000Z' },
      { tenantScope: scope, approvedAt: '2026-01-04T00:00:00.000Z', mfaSatisfied: false },
    ),
    { accepted: false, code: 'MFA_REQUIRED' },
  );
  const authorized = authorizeArtifactDeletionV1(
    blocked.value,
    { eligible: true, blockers: [], evaluatedAt: '2026-01-04T00:00:00.000Z' },
    { tenantScope: scope, approvedAt: '2026-01-04T00:00:00.000Z', mfaSatisfied: true },
  );
  assert.equal(authorized.accepted, true);
  if (authorized.accepted) assert.equal(authorized.value.state, 'AUTHORIZED');
});
