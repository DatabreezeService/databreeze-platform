import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { GovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';
import {
  PrismaGovernedDatasetRepositoryAdapter,
  type GovernedDatasetDatabaseClientV1,
  type GovernedDatasetDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-governed-dataset-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function identifier(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture identifier rejected');
  return result.value;
}

const organizationId = identifier('00000000-0000-4000-8000-000000000101');
const workspaceId = identifier('00000000-0000-4000-8000-000000000102');
const siblingWorkspaceId = identifier('00000000-0000-4000-8000-000000000103');
const datasetId = identifier('00000000-0000-4000-8000-000000000104');
const versionId = identifier('00000000-0000-4000-8000-000000000105');
const fieldId = identifier('00000000-0000-4000-8000-000000000106');

function context(candidateWorkspaceId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000107',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000108',
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function row(id: string, candidateWorkspaceId: string): GovernedDatasetDatabaseRowV1 {
  return {
    id,
    datasetId,
    scopeType: 'workspace',
    organizationId,
    workspaceId: candidateWorkspaceId,
    projectId: null,
    schemaVersion: 1,
    name: 'Orders',
    fields: [
      {
        fieldId,
        name: 'Order ID',
        type: 'TEXT',
        nullable: false,
        aliases: [],
        localizedLabels: { en: 'Order ID' },
        sensitivity: 'INTERNAL',
        defaultBehavior: 'NONE',
      },
    ],
    status: 'DRAFT',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedAt: null,
    canonicalHash: 'a'.repeat(64),
  };
}

function client(rows: GovernedDatasetDatabaseRowV1[]): GovernedDatasetDatabaseClientV1 {
  return {
    datasetDefinitionRecord: {
      create(input) {
        const created = { ...input.data } as GovernedDatasetDatabaseRowV1;
        rows.push(created);
        return Promise.resolve(created);
      },
      findUnique(input) {
        return Promise.resolve(rows.find((candidate) => candidate.id === input.where.id) ?? null);
      },
      findMany(input) {
        return Promise.resolve(
          rows
            .filter(
              (candidate) =>
                candidate.datasetId === input.where['datasetId'] &&
                candidate.organizationId === input.where['organizationId'],
            )
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[DSM-001, IAM-009] Prisma dataset adapter maps immutable rows and filters sibling workspaces', async () => {
  const repository = new PrismaGovernedDatasetRepositoryAdapter(
    client([
      row(versionId, workspaceId),
      { ...row('00000000-0000-4000-8000-000000000109', siblingWorkspaceId) },
    ]),
  );
  const listed = await repository.list(context(workspaceId, 'list'), datasetId);
  assert.deepEqual(
    listed.map((definition) => definition.versionId),
    [versionId],
  );
  assert.equal((await repository.find(context(workspaceId, 'find'), versionId))?.name, 'Orders');
});

void test('[DSM-001] Prisma dataset adapter persists a replay exactly once', async () => {
  const rows: GovernedDatasetDatabaseRowV1[] = [];
  const repository = new PrismaGovernedDatasetRepositoryAdapter(client(rows));
  const dataset = parseStableIdentifierV1(datasetId);
  const version = parseStableIdentifierV1(versionId);
  const field = parseStableIdentifierV1(fieldId);
  const created = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(dataset.accepted, true);
  assert.equal(version.accepted, true);
  assert.equal(field.accepted, true);
  assert.equal(created.accepted, true);
  if (!dataset.accepted || !version.accepted || !field.accepted || !created.accepted)
    throw new Error('fixture rejected');
  const definition: GovernedDatasetDefinitionV1 = {
    schemaVersion: 1,
    datasetId: dataset.value,
    versionId: version.value,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    name: 'Orders',
    fields: [
      {
        fieldId: field.value,
        name: 'Order ID',
        type: 'TEXT',
        nullable: false,
        aliases: [],
        localizedLabels: { en: 'Order ID' },
        sensitivity: 'INTERNAL',
        defaultBehavior: 'NONE',
      },
    ],
    status: 'DRAFT',
    createdAt: created.value,
    canonicalHash: 'a'.repeat(64),
  };
  await repository.save(context(workspaceId, 'save'), definition);
  await repository.save(context(workspaceId, 'replay'), definition);
  assert.equal(rows.length, 1);
});
