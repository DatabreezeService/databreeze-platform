import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryDatasetProfileRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-profile-repository.adapter.js';
import { DatasetProfileService } from '../../../src/features/dsm/application/dataset-profile.service.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-000000000771',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000772',
    workspaceId: '00000000-0000-4000-8000-000000000773',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-000000000774',
  idempotencyKey: 'profile-pagination',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier rejected');
  return parsed.value;
}

const datasetVersionId = id('00000000-0000-4000-8000-000000000775');

function profile(profileId: StableIdentifierV1) {
  return {
    profileId,
    datasetVersionId,
    tenantScope: context.tenantScope,
    completeness: 'COMPLETE' as const,
    samplingMethod: 'FULL_SCAN_V1',
    excludedScopes: [],
    rowCountScanned: 10,
    resourceLimits: { maxRows: 100, maxBytes: 1000, maxDurationMs: 60000 },
    profileFingerprint: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[DSM-021] profile page cursors are stable and bound to one dataset version', async () => {
  const service = new DatasetProfileService(new InMemoryDatasetProfileRepositoryAdapter());
  await service.register(context, profile(id('00000000-0000-4000-8000-000000000776')));
  await service.register(context, profile(id('00000000-0000-4000-8000-000000000777')));
  const first = await service.listPage(context, datasetVersionId, {
    limit: 1,
  });
  assert.equal(first.items.length, 1);
  const firstItem = first.items[0];
  assert.ok(firstItem);
  assert.equal(first.nextCursor, firstItem.profileId);
  const second = await service.listPage(context, datasetVersionId, {
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.items.map((item) => item.profileId),
    ['00000000-0000-4000-8000-000000000777'],
  );
  assert.equal(second.nextCursor, undefined);
});
