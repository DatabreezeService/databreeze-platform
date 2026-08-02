import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDatasetProfileV1,
  DATASET_PROFILE_SCHEMA_VERSION_V1,
} from '../dist/dataset-profile/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000701',
  workspaceId: '00000000-0000-4000-8000-000000000702',
};

const base = {
  profileId: '00000000-0000-4000-8000-000000000703',
  datasetVersionId: '00000000-0000-4000-8000-000000000704',
  tenantScope: scope,
  completeness: 'DETERMINISTIC_SAMPLE',
  samplingMethod: 'HASHED_ROW_RESERVOIR_V1',
  samplingSeed: 'a'.repeat(64),
  excludedScopes: ['restricted:payroll'],
  rowCountScanned: 500,
  rowCountAvailable: 1000,
  resourceLimits: { maxRows: 10000, maxBytes: 1000000, maxDurationMs: 60000 },
  profileFingerprint: 'b'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-011] profile disclosure preserves deterministic sampling, exclusions, counts, and limits', () => {
  const result = createDatasetProfileV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.schemaVersion, DATASET_PROFILE_SCHEMA_VERSION_V1);
  assert.equal(result.value.completeness, 'DETERMINISTIC_SAMPLE');
  assert.equal(result.value.samplingSeed, 'a'.repeat(64));
  assert.equal(result.value.rowCountScanned, 500);
  assert.deepEqual(result.value.resourceLimits, {
    maxRows: 10000,
    maxBytes: 1000000,
    maxDurationMs: 60000,
  });
});

void test('[DSM-011] complete profiles reject sample-only fields and impossible counts', () => {
  assert.deepEqual(
    createDatasetProfileV1({
      ...base,
      completeness: 'COMPLETE',
      samplingSeed: undefined,
      rowCountScanned: 1001,
    }),
    { accepted: false, code: 'INVALID_COUNT' },
  );
  assert.deepEqual(
    createDatasetProfileV1({ ...base, completeness: 'COMPLETE', samplingSeed: 'a'.repeat(64) }),
    { accepted: false, code: 'INVALID_SAMPLING' },
  );
});
