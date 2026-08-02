import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-repository.adapter.js';
import { DatasetDefinitionService } from '../../../src/features/dsm/application/dataset-definition.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid dataset identifier');
  return parsed.value;
}

function context(workspace: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid dataset context');
  return result.value;
}

const input = {
  datasetId: '00000000-0000-4000-8000-000000000020',
  versionId: '00000000-0000-4000-8000-000000000021',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  name: 'Sales ledger',
  fields: [{ name: 'order_id', type: 'TEXT', required: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-001, DSM-004, DSM-005] service creates and publishes immutable dataset versions', async () => {
  const repository = new InMemoryDatasetRepositoryAdapter();
  const service = new DatasetDefinitionService(repository);
  const created = await service.create(context(workspaceId, 'dataset-1'), input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(await service.create(context(workspaceId, 'dataset-1'), input), created);
  const published = await service.publish(
    context(workspaceId, 'dataset-publish'),
    created.value.versionId,
    '00000000-0000-4000-8000-000000000022',
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(published.accepted, true);
  if (published.accepted) assert.equal(published.value.status, 'PUBLISHED');
  assert.equal(
    (await service.list(context(workspaceId, 'dataset-list'), stable(input.datasetId))).length,
    2,
  );
});

void test('[IAM-009, DSM-006] sibling workspaces cannot read governed definitions', async () => {
  const repository = new InMemoryDatasetRepositoryAdapter();
  const service = new DatasetDefinitionService(repository);
  const created = await service.create(context(workspaceId, 'dataset-2'), input);
  assert.equal(created.accepted, true);
  assert.equal(
    (await service.list(context(siblingWorkspaceId, 'dataset-sibling'), stable(input.datasetId)))
      .length,
    0,
  );
});
