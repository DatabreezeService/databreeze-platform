import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryMappingRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-mapping-repository.adapter.js';
import { MappingService } from '../../../src/features/dsm/application/mapping.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(workspaceIdValue: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({ tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspaceIdValue }, actorId, correlationId, idempotencyKey, authorizationEpoch: 1 });
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
  datasetId: '00000000-0000-4000-8000-000000000020', versionId: '00000000-0000-4000-8000-000000000021',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId }, sourceSchemaVersionId: '00000000-0000-4000-8000-000000000022', targetSchemaVersionId: '00000000-0000-4000-8000-000000000023',
  steps: [{ sourceFieldId: '00000000-0000-4000-8000-000000000024', targetFieldId: '00000000-0000-4000-8000-000000000025', transform: 'TRIM' }], createdAt: '2026-01-01T00:00:00.000Z', canonicalHash: 'a'.repeat(64),
};

void test('[DSM-007, DSM-008] mapping service versions and publishes definitions', async () => {
  const service = new MappingService(new InMemoryMappingRepositoryAdapter());
  const created = await service.create(context(workspaceId, 'mapping-create'), input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const published = await service.publish(context(workspaceId, 'mapping-publish'), stable(input.versionId), '00000000-0000-4000-8000-000000000026', '2026-01-01T00:01:00.000Z');
  assert.equal(published.accepted, true);
  assert.equal((await service.list(context(workspaceId, 'mapping-list'), stable(input.datasetId))).length, 2);
});

void test('[IAM-009, DSM-007] sibling workspaces cannot read mappings', async () => {
  const service = new MappingService(new InMemoryMappingRepositoryAdapter());
  await service.create(context(workspaceId, 'mapping-scope-create'), input);
  assert.equal((await service.list(context(siblingWorkspaceId, 'mapping-scope-list'), stable(input.datasetId))).length, 0);
});
