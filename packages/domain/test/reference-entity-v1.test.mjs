import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBusinessPartyVersionV1,
  mergeBusinessPartyVersionsV1,
} from '../dist/reference-entity/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const base = {
  entityId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
  tenantScope: scope,
  displayName: 'Công ty Ánh Dương',
  roles: ['SUPPLIER'],
  aliases: ['Anh Duong Co.'],
  externalIdentifiers: [{ namespace: 'tax.vn', value: '0101234567' }],
  status: 'ACTIVE',
  visibility: 'WORKSPACE',
  canonicalHash: 'f'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-025, DSM-026] business-party versions are workspace-scoped and canonical', () => {
  const result = createBusinessPartyVersionV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.displayName, 'Công ty Ánh Dương');
  assert.equal(Object.isFrozen(result.value.externalIdentifiers[0]), true);
  assert.deepEqual(createBusinessPartyVersionV1({ ...base, roles: [] }), {
    accepted: false,
    code: 'INVALID_ROLE',
  });
});

void test('[DSM-027] merge creates an explicit redirect without retargeting history', () => {
  const source = createBusinessPartyVersionV1(base);
  const target = createBusinessPartyVersionV1({
    ...base,
    entityId: '00000000-0000-4000-8000-000000000012',
    versionId: '00000000-0000-4000-8000-000000000013',
    displayName: 'Ánh Dương Trading',
    canonicalHash: '1'.repeat(64),
  });
  assert.equal(source.accepted, true);
  assert.equal(target.accepted, true);
  if (!source.accepted || !target.accepted) return;
  const merged = mergeBusinessPartyVersionsV1({
    source: source.value,
    target: target.value,
    resolutionId: '00000000-0000-4000-8000-000000000014',
    actorId: '00000000-0000-4000-8000-000000000015',
    reason: 'Duplicate tax identifier review',
    evidenceId: '00000000-0000-4000-8000-000000000016',
    resolvedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.equal(merged.accepted, true);
  if (merged.accepted) {
    assert.equal(merged.value.sourceEntityId, source.value.entityId);
    assert.equal(merged.value.targetEntityId, target.value.entityId);
  }
});
