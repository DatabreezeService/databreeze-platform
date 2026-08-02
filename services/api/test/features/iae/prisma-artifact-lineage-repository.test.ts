import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createArtifactLineageV1 } from '@databreeze/domain/artifact-governance/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaArtifactLineageRepositoryAdapter,
  type ArtifactLineageDatabaseClientV1,
  type ArtifactLineageDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-lineage-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-lineage',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;
const lineageResult = createArtifactLineageV1({
  lineageId: '55555555-5555-4555-8555-555555555555',
  derivedArtifactVersionId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  sourceArtifactVersionIds: ['77777777-7777-4777-8777-777777777777'],
  processorVersion: 'normalizer@1',
  coordinateLineage: [],
});
if (!lineageResult.accepted) throw new Error('fixture lineage invalid');
const lineage = lineageResult.value;

function client(rows: ArtifactLineageDatabaseRowV1[]): ArtifactLineageDatabaseClientV1 {
  return {
    artifactLineageRecord: {
      create({ data }) {
        rows.push({ ...data });
        return Promise.resolve({ ...data });
      },
      findUnique({ where }) {
        const row =
          'id' in where
            ? rows.find((candidate) => candidate.id === where.id)
            : rows.find(
                (candidate) =>
                  candidate.derivedArtifactVersionId === where.derivedArtifactVersionId,
              );
        return Promise.resolve(row ?? null);
      },
      findMany({ where }) {
        return Promise.resolve(
          rows
            .filter(
              (row) =>
                Array.isArray(row.sourceVersionIds) &&
                row.sourceVersionIds.includes(where.sourceVersionIds.array_contains),
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

void test('IAE-007 Prisma lineage adapter preserves immutable lineage and source lookup', async () => {
  const rows: ArtifactLineageDatabaseRowV1[] = [];
  const repository = new PrismaArtifactLineageRepositoryAdapter(client(rows));
  await repository.save(context, lineage);
  await repository.save(context, lineage);
  assert.deepEqual(
    await repository.findByDerived(context, lineage.derivedArtifactVersionId),
    lineage,
  );
  const sourceVersionId = lineage.sourceArtifactVersionIds[0];
  if (!sourceVersionId) throw new Error('fixture source id missing');
  assert.deepEqual(await repository.listBySource(context, sourceVersionId), [lineage]);
  assert.equal(rows.length, 1);
});
