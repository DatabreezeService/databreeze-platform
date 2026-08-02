import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createDatasetProfileV1 } from '@databreeze/domain/dataset-profile/v1';
import {
  PrismaDatasetProfileRepositoryAdapter,
  type DatasetProfileDatabaseClientV1,
  type DatasetProfileDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-dataset-profile-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier rejected');
  return parsed.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000761');
const workspaceId = id('00000000-0000-4000-8000-000000000762');
const profileId = id('00000000-0000-4000-8000-000000000763');

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000764',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000765',
    idempotencyKey: 'prisma-profile',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(rows: DatasetProfileDatabaseRowV1[]): DatasetProfileDatabaseClientV1 {
  return {
    datasetProfileRecord: {
      create({ data }) {
        const persisted = { ...data } as DatasetProfileDatabaseRowV1;
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      findMany({ where }) {
        return Promise.resolve(
          rows
            .filter(
              (row) =>
                row.datasetVersionId === where['datasetVersionId'] &&
                row.organizationId === where['organizationId'],
            )
            .sort((left, right) => left.id.localeCompare(right.id)),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[DSM-011, IAM-009] Prisma profile adapter persists immutable disclosure and hides siblings', async () => {
  const tenantContext = context();
  const created = createDatasetProfileV1({
    profileId,
    datasetVersionId: '00000000-0000-4000-8000-000000000766',
    tenantScope: tenantContext.tenantScope,
    completeness: 'DETERMINISTIC_SAMPLE',
    samplingMethod: 'HASHED_ROW_RESERVOIR_V1',
    samplingSeed: 'a'.repeat(64),
    excludedScopes: ['restricted:payroll'],
    rowCountScanned: 5,
    rowCountAvailable: 10,
    resourceLimits: { maxRows: 100, maxBytes: 1000, maxDurationMs: 60000 },
    profileFingerprint: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const rows: DatasetProfileDatabaseRowV1[] = [];
  const repository = new PrismaDatasetProfileRepositoryAdapter(client(rows));
  await repository.save(tenantContext, created.value);
  await repository.save(tenantContext, created.value);
  assert.deepEqual(await repository.find(tenantContext, profileId), created.value);
  assert.deepEqual(await repository.list(tenantContext, created.value.datasetVersionId), [
    created.value,
  ]);
  assert.equal(rows.length, 1);
});
