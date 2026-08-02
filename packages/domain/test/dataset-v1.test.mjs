import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areDatasetSchemasCompatibleV1,
  createDatasetDefinitionV1,
  publishDatasetDefinitionV1,
} from '../dist/dataset/v1.js';

const base = {
  datasetId: '00000000-0000-4000-8000-000000000001',
  versionId: '00000000-0000-4000-8000-000000000002',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000010',
    workspaceId: '00000000-0000-4000-8000-000000000011',
  },
  name: 'Sales ledger',
  fields: [
    { name: 'order_id', type: 'TEXT', required: true, semanticKey: 'order.id' },
    { name: 'amount', type: 'DECIMAL', required: false, semanticKey: 'money.amount' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-001, DSM-002, DSM-003] dataset definitions normalize immutable fields', () => {
  const result = createDatasetDefinitionV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.status, 'DRAFT');
  assert.equal(result.value.fields[0]?.name, 'order_id');
  assert.deepEqual(
    createDatasetDefinitionV1({
      ...base,
      fields: [
        { name: 'order_id', type: 'TEXT', required: true },
        { name: 'order_id', type: 'TEXT', required: false },
      ],
    }),
    { accepted: false, code: 'INVALID_FIELD' },
  );
});

void test('[DSM-004, DSM-005] publication and compatibility are explicit', () => {
  const result = createDatasetDefinitionV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const published = publishDatasetDefinitionV1(result.value, '2026-01-01T00:01:00.000Z');
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  assert.equal(published.value.status, 'PUBLISHED');
  assert.deepEqual(publishDatasetDefinitionV1(published.value, '2026-01-01T00:02:00.000Z'), {
    accepted: false,
    code: 'INVALID_STATE',
  });
  const compatible = createDatasetDefinitionV1({
    ...base,
    versionId: '00000000-0000-4000-8000-000000000003',
    fields: [...base.fields, { name: 'note', type: 'TEXT', required: false }],
  });
  assert.equal(compatible.accepted, true);
  if (compatible.accepted)
    assert.deepEqual(areDatasetSchemasCompatibleV1(result.value, compatible.value), {
      accepted: true,
      value: true,
    });
});
