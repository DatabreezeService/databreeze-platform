import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createDatasetExportManifestV1 } from '@databreeze/domain/dataset-export/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaDatasetExportRepositoryAdapter,
  type DatasetExportDatabaseClientV1,
  type DatasetExportDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-dataset-export-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-dataset-export',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const manifest = createDatasetExportManifestV1({
  manifestId: '55555555-5555-4555-8555-555555555555',
  datasetId: '66666666-6666-4666-8666-666666666666',
  datasetVersionId: '77777777-7777-4777-8777-777777777777',
  tenantScope: context.tenantScope,
  dataMode: 'HYBRID',
  payloadClass: 'GOVERNED_DATA',
  format: 'JSONL',
  rowCount: 2,
  byteSize: 100,
  contentSha256: 'a'.repeat(64),
  schemaVersionId: '88888888-8888-4888-8888-888888888888',
  mappingVersionId: '99999999-9999-4999-8999-999999999999',
  ruleSetVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  semanticManifestHash: 'b'.repeat(64),
  metricManifestHash: 'c'.repeat(64),
  qualityManifestHash: 'd'.repeat(64),
  lineageManifestHash: 'e'.repeat(64),
  evidenceManifestHash: 'f'.repeat(64),
  policyHash: '0'.repeat(64),
  qualityState: 'PASS',
  approvalState: 'APPROVED',
  createdAt: '2026-08-04T00:00:00.000Z',
});
if (!manifest.accepted) throw new Error('fixture export invalid');

function client(rows: DatasetExportDatabaseRowV1[]): DatasetExportDatabaseClientV1 {
  return {
    datasetExportManifestRecord: {
      create({ data }) {
        const row = { ...data } as DatasetExportDatabaseRowV1;
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('DSM-022 Prisma export adapter persists only manifest metadata', async () => {
  const rows: DatasetExportDatabaseRowV1[] = [];
  const repository = new PrismaDatasetExportRepositoryAdapter(client(rows));
  await repository.save(context, manifest.value);
  await repository.save(context, manifest.value);
  assert.deepEqual(await repository.find(context, manifest.value.manifestId), manifest.value);
  assert.equal(rows.length, 1);
  assert.equal(Object.hasOwn(rows[0] as object, 'rows'), false);
});
