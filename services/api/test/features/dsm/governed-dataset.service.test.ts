import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { GovernedDatasetService } from '../../../src/features/dsm/application/governed-dataset.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(workspace: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid identifier');
  return result.value;
}

const input = {
  datasetId: '00000000-0000-4000-8000-000000000020',
  versionId: '00000000-0000-4000-8000-000000000021',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  name: 'Orders',
  fields: [{ fieldId: '00000000-0000-4000-8000-000000000022', name: 'amount', type: 'DECIMAL', nullable: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  canonicalHash: 'a'.repeat(64),
};

void test('[DSM-001, DSM-004, DSM-005, DSM-006] service creates, publishes, compares, and lists governed versions', async () => {
  const service = new GovernedDatasetService(new InMemoryGovernedDatasetRepositoryAdapter());
  const created = await service.create(context(workspaceId, 'governed-1'), input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const published = await service.publish(
    context(workspaceId, 'governed-2'),
    stable(input.versionId),
    '00000000-0000-4000-8000-000000000023',
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  const comparison = await service.compare(
    context(workspaceId, 'governed-3'),
    stable(input.versionId),
    stable('00000000-0000-4000-8000-000000000023'),
  );
  assert.deepEqual(comparison, { accepted: true, value: 'ADDITIVE_COMPATIBLE' });
  assert.equal((await service.list(context(workspaceId, 'governed-4'), stable(input.datasetId))).length, 2);
});

void test('[IAM-009, DSM-018] governed definitions do not cross sibling workspaces', async () => {
  const service = new GovernedDatasetService(new InMemoryGovernedDatasetRepositoryAdapter());
  await service.create(context(workspaceId, 'governed-scope-1'), input);
  assert.equal((await service.list(context(siblingWorkspaceId, 'governed-scope-2'), stable(input.datasetId))).length, 0);
});
