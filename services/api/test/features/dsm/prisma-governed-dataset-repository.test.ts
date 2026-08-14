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
const projectId = identifier('00000000-0000-4000-8000-000000000111');
const siblingProjectId = identifier('00000000-0000-4000-8000-000000000112');
const otherOrganizationId = identifier('00000000-0000-4000-8000-000000000113');

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

function organizationContext(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000107',
    tenantScope: { scopeType: 'organization', organizationId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000108',
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function projectContext(candidateProjectId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000107',
    tenantScope: {
      scopeType: 'project',
      organizationId,
      workspaceId,
      projectId: candidateProjectId,
    },
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
    revision: 1,
    canonicalHash: 'a'.repeat(64),
  };
}

function client(
  rows: GovernedDatasetDatabaseRowV1[],
  queries: unknown[] = [],
): GovernedDatasetDatabaseClientV1 {
  const matches = (
    candidate: GovernedDatasetDatabaseRowV1,
    where: Readonly<Record<string, unknown>>,
  ): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR' && Array.isArray(value)) {
        return value.some(
          (branch) =>
            typeof branch === 'object' &&
            branch !== null &&
            matches(candidate, branch as Readonly<Record<string, unknown>>),
        );
      }
      return candidate[key as keyof GovernedDatasetDatabaseRowV1] === value;
    });
  return {
    datasetDefinitionRecord: {
      create(input) {
        const created = { ...input.data } as GovernedDatasetDatabaseRowV1;
        rows.push(created);
        return Promise.resolve(created);
      },
      findFirst(input) {
        queries.push(input);
        return Promise.resolve(
          rows.find((candidate) =>
            Object.entries(input.where).every(([key, value]) => {
              return candidate[key as keyof GovernedDatasetDatabaseRowV1] === value;
            }),
          ) ?? null,
        );
      },
      findMany(input) {
        queries.push(input);
        return Promise.resolve(
          rows
            .filter((candidate) => matches(candidate, input.where))
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

void test('[IAM-009, IAM-019] Prisma version reads and saves use the full exact tenant scope predicate', async () => {
  const queries: unknown[] = [];
  const repository = new PrismaGovernedDatasetRepositoryAdapter(
    client(
      [
        row(versionId, siblingWorkspaceId),
        {
          ...row(versionId, workspaceId),
          organizationId: otherOrganizationId,
        },
        {
          ...row(versionId, workspaceId),
          scopeType: 'project',
          projectId: siblingProjectId,
        },
      ],
      queries,
    ),
  );

  assert.equal(await repository.find(context(workspaceId, 'exact-find'), versionId), undefined);
  assert.deepEqual(queries[0], {
    where: {
      id: versionId,
      scopeType: 'workspace',
      organizationId,
      workspaceId,
      projectId: null,
    },
  });

  const definition: GovernedDatasetDefinitionV1 = {
    schemaVersion: 1,
    datasetId,
    versionId,
    tenantScope: { scopeType: 'project', organizationId, workspaceId, projectId },
    name: 'Project orders',
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
    createdAt: '2026-01-01T00:00:00.000Z' as GovernedDatasetDefinitionV1['createdAt'],
    canonicalHash: 'b'.repeat(64),
  };
  await repository.save(projectContext(projectId, 'exact-save'), definition);
  assert.deepEqual(queries[1], {
    where: {
      id: versionId,
      scopeType: 'project',
      organizationId,
      workspaceId,
      projectId,
    },
  });
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

void test('[DSM-001] Prisma dataset adapter rejects a non-initial immutable revision', async () => {
  const repository = new PrismaGovernedDatasetRepositoryAdapter(
    client([{ ...row(versionId, workspaceId), revision: 2 }]),
  );
  await assert.rejects(
    repository.find(context(workspaceId, 'invalid-revision'), versionId),
    /DSM_PERSISTED_REVISION_INVALID/u,
  );
});

void test('[DSM-018, DSM-021] Prisma published index query is tenant-filtered before in-memory scope recheck', async () => {
  const queries: unknown[] = [];
  const repository = new PrismaGovernedDatasetRepositoryAdapter(
    client(
      [
        {
          ...row(versionId, workspaceId),
          status: 'PUBLISHED',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          ...row('00000000-0000-4000-8000-000000000110', siblingWorkspaceId),
          status: 'PUBLISHED',
          publishedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
      queries,
    ),
  );

  const listed = await repository.listPublished(context(workspaceId, 'published-index'));
  assert.deepEqual(
    listed.map((definition) => definition.versionId),
    [versionId],
  );
  assert.deepEqual(queries[0], {
    where: {
      organizationId,
      status: 'PUBLISHED',
      scopeType: 'workspace',
      workspaceId,
      projectId: null,
    },
    orderBy: { createdAt: 'asc' },
  });
});

void test('[DSM-018] organization context queries all published scopes in its organization', async () => {
  const queries: unknown[] = [];
  const repository = new PrismaGovernedDatasetRepositoryAdapter(
    client(
      [
        {
          ...row(versionId, workspaceId),
          scopeType: 'organization',
          workspaceId: null,
          projectId: null,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      queries,
    ),
  );

  const listed = await repository.listPublished(organizationContext('published-organization'));
  assert.deepEqual(
    listed.map((definition) => definition.versionId),
    [versionId],
  );
  assert.deepEqual(queries[0], {
    where: {
      organizationId,
      status: 'PUBLISHED',
      scopeType: 'organization',
      workspaceId: null,
      projectId: null,
    },
    orderBy: { createdAt: 'asc' },
  });
});
