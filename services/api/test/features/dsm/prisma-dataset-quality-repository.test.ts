import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createDatasetQualityResultV1 } from '@databreeze/domain/dataset-quality/v1';
import {
  PrismaDatasetQualityRepositoryAdapter,
  type DatasetQualityDatabaseClientV1,
  type DatasetQualityDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-dataset-quality-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier rejected');
  return parsed.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000901');
const workspaceId = id('00000000-0000-4000-8000-000000000902');
const resultId = id('00000000-0000-4000-8000-000000000903');

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000904',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000905',
    idempotencyKey: 'prisma-quality-result',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(rows: DatasetQualityDatabaseRowV1[]): DatasetQualityDatabaseClientV1 {
  return {
    datasetQualityResultRecord: {
      create({ data }) {
        const persisted = { ...data } as DatasetQualityDatabaseRowV1;
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

void test('[DSM-011, DSM-013, IAM-009] Prisma quality adapter persists immutable scoped results', async () => {
  const tenantContext = context();
  const created = createDatasetQualityResultV1({
    resultId,
    datasetId: '00000000-0000-4000-8000-000000000906',
    datasetVersionId: '00000000-0000-4000-8000-000000000907',
    tenantScope: tenantContext.tenantScope,
    ruleSetVersionId: '00000000-0000-4000-8000-000000000908',
    profileFingerprint: 'a'.repeat(64),
    rowCountScanned: 5,
    qualityState: 'PASS',
    findings: [],
    resultFingerprint: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const rows: DatasetQualityDatabaseRowV1[] = [];
  const repository = new PrismaDatasetQualityRepositoryAdapter(client(rows));
  await repository.save(tenantContext, created.value);
  await repository.save(tenantContext, created.value);
  assert.deepEqual(await repository.find(tenantContext, resultId), created.value);
  assert.deepEqual(await repository.list(tenantContext, created.value.datasetVersionId), [
    created.value,
  ]);
  assert.equal(rows.length, 1);
});
