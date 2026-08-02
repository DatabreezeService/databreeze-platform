import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryRuleSetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-rule-set-repository.adapter.js';
import { RuleSetService } from '../../../src/features/dsm/application/rule-set.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({ tenantScope: { scopeType: 'workspace', organizationId, workspaceId }, actorId, correlationId, idempotencyKey, authorizationEpoch: 1 });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid id');
  return result.value;
}

const input = {
  datasetId: '00000000-0000-4000-8000-000000000020', versionId: '00000000-0000-4000-8000-000000000021', tenantScope: { scopeType: 'workspace', organizationId, workspaceId }, schemaVersionId: '00000000-0000-4000-8000-000000000022', createdAt: '2026-01-01T00:00:00.000Z', canonicalHash: 'a'.repeat(64),
  rules: [{ ruleId: '00000000-0000-4000-8000-000000000023', fieldId: '00000000-0000-4000-8000-000000000024', kind: 'REQUIRED', severity: 'ERROR' }],
};

void test('[DSM-009, DSM-010, DSM-011] rule-set service versions and publishes deterministic rules', async () => {
  const service = new RuleSetService(new InMemoryRuleSetRepositoryAdapter());
  const created = await service.create(context('rules-create'), input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal((await service.publish(context('rules-publish'), stable(input.versionId), '00000000-0000-4000-8000-000000000025', '2026-01-01T00:01:00.000Z')).accepted, true);
  assert.equal((await service.list(context('rules-list'), stable(input.datasetId))).length, 2);
});

void test('[DSM-009] missing rule-set versions return a stable application error', async () => {
  const service = new RuleSetService(new InMemoryRuleSetRepositoryAdapter());
  const result = await service.publish(context('rules-missing'), stable('00000000-0000-4000-8000-000000000026'), '00000000-0000-4000-8000-000000000027', '2026-01-01T00:01:00.000Z');
  assert.deepEqual(result, { accepted: false, code: 'VERSION_NOT_FOUND' });
});
