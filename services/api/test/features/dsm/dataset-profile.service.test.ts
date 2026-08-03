import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryDatasetProfileRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-profile-repository.adapter.js';
import { DatasetProfileService } from '../../../src/features/dsm/application/dataset-profile.service.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-000000000741',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000742',
    workspaceId: '00000000-0000-4000-8000-000000000743',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-000000000744',
  idempotencyKey: 'profile-service',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const input = {
  profileId: '00000000-0000-4000-8000-000000000745',
  datasetVersionId: '00000000-0000-4000-8000-000000000746',
  tenantScope: context.tenantScope,
  completeness: 'DETERMINISTIC_SAMPLE',
  samplingMethod: 'HASHED_ROW_RESERVOIR_V1',
  samplingSeed: 'a'.repeat(64),
  excludedScopes: ['restricted:payroll'],
  rowCountScanned: 100,
  rowCountAvailable: 1000,
  resourceLimits: { maxRows: 1000, maxBytes: 1000000, maxDurationMs: 60000 },
  profileFingerprint: 'b'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[DSM-011, IAM-009] profile service registers immutable scoped disclosures', async () => {
  const service = new DatasetProfileService(new InMemoryDatasetProfileRepositoryAdapter());
  const first = await service.register(context, input);
  assert.equal(first.accepted, true);
  const replay = await service.register(context, input);
  assert.equal(replay.accepted, true);
  if (!first.accepted || !replay.accepted) return;
  assert.deepEqual(replay.value, first.value);
  const listed = await service.list(context, first.value.datasetVersionId);
  assert.equal(listed.length, 1);
});

void test('[DSM-011, IAM-009] sibling workspace cannot read profile disclosure', async () => {
  const repository = new InMemoryDatasetProfileRepositoryAdapter();
  const service = new DatasetProfileService(repository);
  const first = await service.register(context, input);
  assert.equal(first.accepted, true);
  const siblingResult = createIamTenantContextV1({
    ...context,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: context.tenantScope.organizationId,
      workspaceId: '00000000-0000-4000-8000-000000000747',
    },
    idempotencyKey: 'profile-sibling',
  });
  assert.equal(siblingResult.accepted, true);
  if (!siblingResult.accepted || !first.accepted) return;
  const found = await service.find(siblingResult.value, first.value.profileId);
  assert.deepEqual(found, { accepted: false, code: 'PROFILE_NOT_FOUND' });
});
