import assert from 'node:assert/strict';
import test from 'node:test';

import { createMappingDefinitionV1, publishMappingDefinitionV1 } from '../dist/mapping/v1.js';
import { createRuleSetDefinitionV1, publishRuleSetDefinitionV1 } from '../dist/rule-set/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};

void test('[DSM-007, DSM-008] mappings are bounded, declarative, and publish as immutable versions', () => {
  const input = {
    datasetId: '00000000-0000-4000-8000-000000000010',
    versionId: '00000000-0000-4000-8000-000000000011',
    tenantScope: scope,
    sourceSchemaVersionId: '00000000-0000-4000-8000-000000000012',
    targetSchemaVersionId: '00000000-0000-4000-8000-000000000013',
    steps: [{ sourceFieldId: '00000000-0000-4000-8000-000000000014', targetFieldId: '00000000-0000-4000-8000-000000000015', transform: 'LOOKUP', lookupVersionId: '00000000-0000-4000-8000-000000000016' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    canonicalHash: 'a'.repeat(64),
  };
  const created = createMappingDefinitionV1(input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const published = publishMappingDefinitionV1(created.value, '00000000-0000-4000-8000-000000000017', '2026-01-01T00:01:00.000Z');
  assert.equal(published.accepted, true);
  assert.deepEqual(createMappingDefinitionV1({ ...input, steps: [{ ...input.steps[0], transform: 'LOOKUP' }] }), created);
});

void test('[DSM-007] mappings reject duplicate targets and executable transforms', () => {
  const base = {
    datasetId: '00000000-0000-4000-8000-000000000020', versionId: '00000000-0000-4000-8000-000000000021', tenantScope: scope,
    sourceSchemaVersionId: '00000000-0000-4000-8000-000000000022', targetSchemaVersionId: '00000000-0000-4000-8000-000000000023', createdAt: '2026-01-01T00:00:00.000Z', canonicalHash: 'b'.repeat(64),
  };
  assert.deepEqual(createMappingDefinitionV1({ ...base, steps: [
    { sourceFieldId: '00000000-0000-4000-8000-000000000024', targetFieldId: '00000000-0000-4000-8000-000000000025', transform: 'IDENTITY' },
    { sourceFieldId: '00000000-0000-4000-8000-000000000026', targetFieldId: '00000000-0000-4000-8000-000000000025', transform: 'IDENTITY' },
  ] }), { accepted: false, code: 'DUPLICATE_MAPPING' });
  assert.deepEqual(createMappingDefinitionV1({ ...base, steps: [{ sourceFieldId: '00000000-0000-4000-8000-000000000024', targetFieldId: '00000000-0000-4000-8000-000000000025', transform: 'EXECUTE_SCRIPT' }] }), { accepted: false, code: 'INVALID_STEP' });
});

void test('[DSM-009, DSM-010, DSM-011] rule sets accept only typed deterministic parameters', () => {
  const input = {
    datasetId: '00000000-0000-4000-8000-000000000030', versionId: '00000000-0000-4000-8000-000000000031', tenantScope: scope,
    schemaVersionId: '00000000-0000-4000-8000-000000000032', createdAt: '2026-01-01T00:00:00.000Z', canonicalHash: 'c'.repeat(64),
    rules: [
      { ruleId: '00000000-0000-4000-8000-000000000033', fieldId: '00000000-0000-4000-8000-000000000034', kind: 'REQUIRED', severity: 'ERROR' },
      { ruleId: '00000000-0000-4000-8000-000000000035', fieldId: '00000000-0000-4000-8000-000000000036', kind: 'RANGE', severity: 'WARNING', parameters: { minimum: 0, maximum: 100 } },
    ],
  };
  const created = createRuleSetDefinitionV1(input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(publishRuleSetDefinitionV1(created.value, '00000000-0000-4000-8000-000000000037', '2026-01-01T00:01:00.000Z').accepted, true);
  assert.deepEqual(createRuleSetDefinitionV1({ ...input, rules: [{ ...input.rules[0], parameters: { script: 'drop table' } }] }), { accepted: false, code: 'INVALID_PARAMETERS' });
});
