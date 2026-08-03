import assert from 'node:assert/strict';
import test from 'node:test';

import { createDatasetExportManifestV1 } from '../dist/dataset-export/v1.js';

const base = {
  manifestId: '11111111-1111-4111-8111-111111111111',
  datasetId: '22222222-2222-4222-8222-222222222222',
  datasetVersionId: '33333333-3333-4333-8333-333333333333',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '44444444-4444-4444-8444-444444444444',
    workspaceId: '55555555-5555-4555-8555-555555555555',
  },
  dataMode: 'HYBRID',
  payloadClass: 'GOVERNED_DATA',
  format: 'CSV',
  rowCount: 12,
  byteSize: 2048,
  contentSha256: 'a'.repeat(64),
  schemaVersionId: '66666666-6666-4666-8666-666666666666',
  mappingVersionId: '77777777-7777-4777-8777-777777777777',
  ruleSetVersionId: '88888888-8888-4888-8888-888888888888',
  semanticManifestHash: 'b'.repeat(64),
  metricManifestHash: 'c'.repeat(64),
  qualityManifestHash: 'd'.repeat(64),
  lineageManifestHash: 'e'.repeat(64),
  evidenceManifestHash: 'f'.repeat(64),
  policyHash: '0'.repeat(64),
  qualityState: 'PASS',
  approvalState: 'APPROVED',
  createdAt: '2026-08-04T00:00:00.000Z',
};

void test('[DSM-022] export manifests bind governance hashes and never contain raw rows', () => {
  const created = createDatasetExportManifestV1(base);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.rowCount, 12);
  assert.equal(Object.hasOwn(created.value, 'rows'), false);
  assert.equal(Object.hasOwn(created.value, 'records'), false);
  assert.equal(created.value.evidenceManifestHash, 'f'.repeat(64));
});

void test('[DSM-022] exports reject invalid policy hashes and unsupported formats', () => {
  assert.deepEqual(createDatasetExportManifestV1({ ...base, format: 'XML' }), {
    accepted: false,
    code: 'INVALID_FORMAT',
  });
  assert.deepEqual(createDatasetExportManifestV1({ ...base, policyHash: 'not-a-hash' }), {
    accepted: false,
    code: 'INVALID_HASH',
  });
});
