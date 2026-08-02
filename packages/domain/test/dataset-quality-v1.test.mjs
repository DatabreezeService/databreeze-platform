import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDatasetQualityResultV1,
  qualityStateFromFindingsV1,
} from '../dist/dataset-quality/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const ids = {
  resultId: '00000000-0000-4000-8000-000000000010',
  datasetId: '00000000-0000-4000-8000-000000000011',
  datasetVersionId: '00000000-0000-4000-8000-000000000012',
  ruleSetVersionId: '00000000-0000-4000-8000-000000000013',
  findingId: '00000000-0000-4000-8000-000000000014',
  ruleId: '00000000-0000-4000-8000-000000000015',
  evidenceId: '00000000-0000-4000-8000-000000000016',
};

function result(overrides = {}) {
  return createDatasetQualityResultV1({
    resultId: ids.resultId,
    datasetId: ids.datasetId,
    datasetVersionId: ids.datasetVersionId,
    tenantScope: scope,
    ruleSetVersionId: ids.ruleSetVersionId,
    profileFingerprint: 'a'.repeat(64),
    rowCountScanned: 42,
    qualityState: 'PASS_WITH_WARNINGS',
    findings: [
      {
        findingId: ids.findingId,
        ruleId: ids.ruleId,
        severity: 'WARNING',
        messageCode: 'NULL_RATE_HIGH',
        occurrenceCount: 2,
        evidenceIds: [ids.evidenceId],
        detailHash: 'b'.repeat(64),
      },
    ],
    resultFingerprint: 'c'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

void test('[DSM-011, DSM-013, DSM-015] quality results are immutable and contain no source values', () => {
  const created = result();
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(Object.isFrozen(created.value), true);
  assert.equal(Object.isFrozen(created.value.findings[0]), true);
  assert.equal('value' in created.value.findings[0], false);
  assert.equal(created.value.qualityState, 'PASS_WITH_WARNINGS');
});

void test('[DSM-020] quality state is deterministic from finding severity and completion', () => {
  const accepted = result();
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(qualityStateFromFindingsV1(accepted.value.findings), 'PASS_WITH_WARNINGS');
  assert.equal(
    qualityStateFromFindingsV1([{ ...accepted.value.findings[0], severity: 'ERROR' }]),
    'BLOCKED',
  );
  assert.equal(qualityStateFromFindingsV1([], true), 'INCOMPLETE');
});

void test('[DSM-013] quality result validation rejects malformed hashes, counts, and duplicate findings', () => {
  assert.deepEqual(result({ profileFingerprint: 'not-a-hash' }), {
    accepted: false,
    code: 'INVALID_HASH',
  });
  assert.deepEqual(result({ rowCountScanned: -1 }), {
    accepted: false,
    code: 'INVALID_COUNT',
  });
  assert.deepEqual(
    result({
      findings: [
        result().accepted ? result().value.findings[0] : undefined,
        result().accepted ? result().value.findings[0] : undefined,
      ],
    }),
    { accepted: false, code: 'DUPLICATE_FINDING' },
  );
});
