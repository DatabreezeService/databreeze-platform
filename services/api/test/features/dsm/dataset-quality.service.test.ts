import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDatasetQualityRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-quality-repository.adapter.js';
import { DatasetQualityService } from '../../../src/features/dsm/application/dataset-quality.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

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
  resultId: '00000000-0000-4000-8000-000000000020',
  datasetId: '00000000-0000-4000-8000-000000000021',
  datasetVersionId: '00000000-0000-4000-8000-000000000022',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  ruleSetVersionId: '00000000-0000-4000-8000-000000000023',
  profileFingerprint: 'a'.repeat(64),
  rowCountScanned: 12,
  qualityState: 'PASS',
  findings: [],
  resultFingerprint: 'b'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-011, DSM-013, DSM-015] service registers and replays immutable quality results', async () => {
  const service = new DatasetQualityService(new InMemoryDatasetQualityRepositoryAdapter());
  const created = await service.register(context(workspaceId, 'quality-1'), input);
  assert.equal(created.accepted, true);
  assert.deepEqual(await service.register(context(workspaceId, 'quality-1'), input), created);
  const found = await service.find(context(workspaceId, 'quality-read'), stable(input.resultId));
  assert.deepEqual(found, created);
  assert.equal(
    (await service.list(context(workspaceId, 'quality-list'), stable(input.datasetVersionId)))
      .length,
    1,
  );
});

void test('[IAM-009, DSM-018] sibling workspaces cannot read quality results', async () => {
  const service = new DatasetQualityService(new InMemoryDatasetQualityRepositoryAdapter());
  await service.register(context(workspaceId, 'quality-2'), {
    ...input,
    resultId: '00000000-0000-4000-8000-000000000024',
  });
  assert.equal(
    (
      await service.list(
        context(siblingWorkspaceId, 'quality-sibling'),
        stable(input.datasetVersionId),
      )
    ).length,
    0,
  );
});
