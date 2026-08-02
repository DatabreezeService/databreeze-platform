import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../dist/result-manifest/v1.js';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  jobId: '00000000-0000-4000-8000-000000000003',
  attemptId: '00000000-0000-4000-8000-000000000004',
  resultManifestId: '00000000-0000-4000-8000-000000000005',
  sourceId: '00000000-0000-4000-8000-000000000006',
  outputId: '00000000-0000-4000-8000-000000000007',
  reviewerId: '00000000-0000-4000-8000-000000000008',
};

function input(overrides = {}) {
  return {
    resultManifestId: ids.resultManifestId,
    jobId: ids.jobId,
    attemptId: ids.attemptId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    sourceArtifactVersionIds: [ids.sourceId],
    outputIds: [ids.outputId],
    outputHashes: ['b'.repeat(64)],
    evidenceCoverage: 'COMPLETE',
    handlerDigest: 'c'.repeat(64),
    engineVersion: 'engine-1.0.0',
    attemptNumber: 1,
    approvalState: 'APPROVED',
    reviewerId: ids.reviewerId,
    manifestHash: 'd'.repeat(64),
    generatedAt: '2026-01-01T00:02:00.000Z',
    ...overrides,
  };
}

void test('[JRA-012, JRA-029] result manifests bind immutable source, output, execution, and approval metadata', () => {
  const created = api.createResultManifestV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(created.value.sourceArtifactVersionIds, [ids.sourceId]);
  assert.deepEqual(created.value.outputHashes, ['b'.repeat(64)]);
  assert.equal(Object.isFrozen(created.value), true);
  assert.equal(Object.isFrozen(created.value.sourceArtifactVersionIds), true);
});

void test('[JRA-012] manifests reject mismatched outputs, unsafe hashes, and unreviewed approvals', () => {
  assert.deepEqual(
    api.createResultManifestV1(input({ outputIds: [], outputHashes: ['b'.repeat(64)] })),
    { accepted: false, code: 'INVALID_LIST' },
  );
  assert.deepEqual(api.createResultManifestV1(input({ manifestHash: 'not-a-hash' })), {
    accepted: false,
    code: 'INVALID_HASH',
  });
  assert.deepEqual(
    api.createResultManifestV1(input({ approvalState: 'APPROVED', reviewerId: undefined })),
    { accepted: false, code: 'INVALID_REVIEWER' },
  );
});
