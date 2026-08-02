import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createDatasetVersionManifestV1 } from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaDatasetVersionRepositoryAdapter,
  type DatasetVersionDatabaseClientV1,
  type DatasetVersionDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-dataset-version-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier rejected');
  return parsed.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000811');
const workspaceId = id('00000000-0000-4000-8000-000000000812');
const versionId = id('00000000-0000-4000-8000-000000000813');

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000814',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000815',
    idempotencyKey: 'prisma-dataset-version',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(rows: DatasetVersionDatabaseRowV1[]): DatasetVersionDatabaseClientV1 {
  return {
    datasetVersionRecord: {
      create({ data }) {
        const persisted = { ...data } as DatasetVersionDatabaseRowV1;
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
                row.datasetId === where['datasetId'] &&
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

void test('[DSM-002, DSM-003, IAM-009] Prisma dataset version adapter is immutable and tenant scoped', async () => {
  const rows: DatasetVersionDatabaseRowV1[] = [];
  const repository = new PrismaDatasetVersionRepositoryAdapter(client(rows));
  const tenantContext = context();
  const created = createDatasetVersionManifestV1({
    datasetId: '00000000-0000-4000-8000-000000000816',
    versionId,
    tenantScope: tenantContext.tenantScope,
    inputArtifactVersionIds: ['00000000-0000-4000-8000-000000000817'],
    schemaVersionId: '00000000-0000-4000-8000-000000000818',
    mappingVersionId: '00000000-0000-4000-8000-000000000819',
    ruleSetVersionId: '00000000-0000-4000-8000-000000000820',
    engineBuild: 'engine@1',
    contentFingerprint: 'a'.repeat(64),
    rowCount: 5,
    qualityState: 'PASS',
    lineageManifestHash: 'b'.repeat(64),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await repository.save(tenantContext, created.value);
  await repository.save(tenantContext, created.value);
  assert.deepEqual(await repository.find(tenantContext, versionId), created.value);
  assert.deepEqual(await repository.list(tenantContext, created.value.datasetId), [created.value]);
  assert.equal(rows.length, 1);
});
