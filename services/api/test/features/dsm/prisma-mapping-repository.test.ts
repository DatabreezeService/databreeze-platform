import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createMappingDefinitionV1 } from '@databreeze/domain/mapping/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaMappingRepositoryAdapter,
  type MappingDatabaseClientV1,
  type MappingDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-mapping-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture id rejected');
  return result.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000201');
const workspaceId = id('00000000-0000-4000-8000-000000000202');
const versionId = id('00000000-0000-4000-8000-000000000203');
const datasetId = id('00000000-0000-4000-8000-000000000204');
const sourceSchemaVersionId = id('00000000-0000-4000-8000-000000000205');
const targetSchemaVersionId = id('00000000-0000-4000-8000-000000000206');
const sourceFieldId = id('00000000-0000-4000-8000-000000000207');
const targetFieldId = id('00000000-0000-4000-8000-000000000208');

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000209',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000210',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(rows: MappingDatabaseRowV1[]): MappingDatabaseClientV1 {
  return {
    mappingDefinitionRecord: {
      create(input) {
        const persisted = { ...input.data } as MappingDatabaseRowV1;
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(rows.find((candidate) => candidate.id === input.where.id) ?? null);
      },
      findMany(input) {
        return Promise.resolve(
          rows
            .filter((candidate) => candidate.datasetId === input.where['datasetId'])
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[DSM-007, IAM-009] Prisma mapping adapter persists and lists typed mappings', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const created = createMappingDefinitionV1({
    datasetId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    sourceSchemaVersionId,
    targetSchemaVersionId,
    steps: [{ sourceFieldId, targetFieldId, transform: 'TRIM' }],
    createdAt: createdAt.value,
    canonicalHash: 'b'.repeat(64),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('fixture mapping rejected');
  const rows: MappingDatabaseRowV1[] = [];
  const repository = new PrismaMappingRepositoryAdapter(client(rows));
  await repository.save(context('save'), created.value);
  assert.deepEqual(
    (await repository.list(context('list'), datasetId)).map((item) => item.versionId),
    [versionId],
  );
});
