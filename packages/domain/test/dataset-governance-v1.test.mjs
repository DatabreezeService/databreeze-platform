import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareGovernedSchemaCompatibilityV1,
  createDatasetVersionManifestV1,
  createGovernedDatasetDefinitionV1,
  publishGovernedDatasetDefinitionV1,
} from '../dist/dataset-governance/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const ids = {
  datasetId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
  amountFieldId: '00000000-0000-4000-8000-000000000012',
};

function definition(fields = [{ fieldId: ids.amountFieldId, name: 'amount', type: 'DECIMAL', nullable: true }]) {
  return createGovernedDatasetDefinitionV1({
    datasetId: ids.datasetId,
    versionId: ids.versionId,
    tenantScope: scope,
    name: 'Orders',
    fields,
    status: 'DRAFT',
    createdAt: '2026-01-01T00:00:00.000Z',
    canonicalHash: 'c'.repeat(64),
  });
}

void test('[DSM-001, DSM-004, DSM-006] governed fields keep stable IDs and immutable metadata', () => {
  const result = definition();
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.fields[0]?.fieldId, ids.amountFieldId);
  assert.equal(Object.isFrozen(result.value.fields[0]), true);
  assert.deepEqual(
    createGovernedDatasetDefinitionV1({
      ...result.value,
      fields: [{ ...result.value.fields[0], fieldId: 'not-a-uuid' }],
    }),
    { accepted: false, code: 'INVALID_FIELD' },
  );
});

void test('[DSM-005] compatibility distinguishes additive, tightening, migration, and breaking changes', () => {
  const previous = definition();
  assert.equal(previous.accepted, true);
  if (!previous.accepted) return;
  const additive = definition([
    ...previous.value.fields,
    { fieldId: '00000000-0000-4000-8000-000000000013', name: 'note', type: 'TEXT', nullable: true },
  ]);
  assert.equal(additive.accepted, true);
  if (!additive.accepted) return;
  assert.deepEqual(compareGovernedSchemaCompatibilityV1(previous.value, additive.value), {
    accepted: true,
    value: 'ADDITIVE_COMPATIBLE',
  });
  const tightening = definition([{ ...previous.value.fields[0], nullable: false }]);
  assert.equal(tightening.accepted, true);
  if (!tightening.accepted) return;
  assert.deepEqual(compareGovernedSchemaCompatibilityV1(previous.value, tightening.value), {
    accepted: true,
    value: 'VALIDATION_TIGHTENING',
  });
  const breaking = definition([{ ...previous.value.fields[0], type: 'TEXT' }]);
  assert.equal(breaking.accepted, true);
  if (breaking.accepted)
    assert.deepEqual(compareGovernedSchemaCompatibilityV1(previous.value, breaking.value), {
      accepted: true,
      value: 'BREAKING',
    });
});

void test('[DSM-002, DSM-012, DSM-014] dataset versions pin every reproducibility input', () => {
  const result = createDatasetVersionManifestV1({
    datasetId: ids.datasetId,
    versionId: ids.versionId,
    tenantScope: scope,
    inputArtifactVersionIds: ['00000000-0000-4000-8000-000000000020'],
    schemaVersionId: ids.versionId,
    mappingVersionId: '00000000-0000-4000-8000-000000000021',
    ruleSetVersionId: '00000000-0000-4000-8000-000000000022',
    engineBuild: 'engine-2026.08.01',
    contentFingerprint: 'd'.repeat(64),
    rowCount: 42,
    qualityState: 'PASS_WITH_WARNINGS',
    lineageManifestHash: 'e'.repeat(64),
  });
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(Object.isFrozen(result.value), true);
});

void test('[DSM-005, DSM-006] publication creates a new immutable version', () => {
  const draft = definition();
  assert.equal(draft.accepted, true);
  if (!draft.accepted) return;
  const published = publishGovernedDatasetDefinitionV1(
    draft.value,
    '00000000-0000-4000-8000-000000000099',
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  assert.equal(published.value.status, 'PUBLISHED');
  assert.notEqual(published.value.versionId, draft.value.versionId);
  assert.equal(draft.value.status, 'DRAFT');
});
