import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  PrismaArtifactIntakeRepositoryAdapter,
  type ArtifactIntakeDatabaseClientV1,
  type ArtifactIntakeDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-intake-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { InboxItemV1 } from '@databreeze/domain/artifact-intake/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

function identifier(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture identifier rejected');
  return result.value;
}

function timestamp(value: string): StrictUtcTimestampV1 {
  const result = parseStrictUtcTimestampV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture timestamp rejected');
  return result.value;
}

const organizationId = identifier('00000000-0000-4000-8000-000000000001');
const workspaceId = identifier('00000000-0000-4000-8000-000000000002');
const siblingWorkspaceId = identifier('00000000-0000-4000-8000-000000000003');
const itemId = identifier('00000000-0000-4000-8000-000000000004');
const artifactVersionId = identifier('00000000-0000-4000-8000-000000000005');

function row(id: string, candidateWorkspaceId: string): ArtifactIntakeDatabaseRowV1 {
  return {
    id,
    scopeType: 'workspace',
    organizationId,
    workspaceId: candidateWorkspaceId,
    projectId: null,
    idempotencyKey: id,
    artifactVersionId,
    state: 'NEW',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    revision: 1,
  };
}

function client(rows: ArtifactIntakeDatabaseRowV1[]): ArtifactIntakeDatabaseClientV1 {
  return {
    inboxItem: {
      create(input) {
        const created = { ...input.data };
        const persisted = { ...created } as ArtifactIntakeDatabaseRowV1;
        if (rows.some((candidate) => candidate.id === persisted.id)) {
          throw Object.assign(new Error('fixture unique constraint violation'), { code: 'P2002' });
        }
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(rows.find((candidate) => candidate.id === input.where.id) ?? null);
      },
      findFirst(input) {
        return Promise.resolve(
          rows.find((candidate) =>
            Object.entries(input.where).every(
              ([key, value]) => candidate[key as keyof ArtifactIntakeDatabaseRowV1] === value,
            ),
          ) ?? null,
        );
      },
      findMany(input) {
        return Promise.resolve(
          rows
            .filter((candidate) => candidate.organizationId === input.where['organizationId'])
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
        );
      },
      update(input) {
        const current = rows.find((candidate) => candidate.id === input.where.id);
        if (!current) throw new Error('fixture inbox item not found');
        const next = { ...current, ...input.data };
        rows[rows.indexOf(current)] = next;
        return Promise.resolve(next);
      },
    },
    async $transaction(work) {
      return work(this);
    },
  };
}

function context(candidateWorkspaceId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000006',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    authorizationEpoch: 3,
    correlationId: '00000000-0000-4000-8000-000000000007',
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-001, IAM-009] Prisma adapter maps rows, lists newest first, and hides sibling workspaces', async () => {
  const rows = [
    row(itemId, workspaceId),
    {
      ...row('00000000-0000-4000-8000-000000000008', siblingWorkspaceId),
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];
  const repository = new PrismaArtifactIntakeRepositoryAdapter(client(rows));
  const listed = await repository.list(context(workspaceId, 'list'));
  assert.deepEqual(
    listed.map((item) => item.inboxItemId),
    [itemId],
  );
  assert.equal(
    (await repository.find(context(workspaceId, 'find'), itemId))?.artifactVersionId,
    artifactVersionId,
  );
});

void test('[IAE-001] Prisma adapter uses immutable idempotent writes', async () => {
  const rows: ArtifactIntakeDatabaseRowV1[] = [];
  const repository = new PrismaArtifactIntakeRepositoryAdapter(client(rows));
  const item: InboxItemV1 = {
    schemaVersion: 1 as const,
    inboxItemId: itemId,
    tenantScope: { scopeType: 'workspace' as const, organizationId, workspaceId },
    idempotencyKey: 'same',
    artifactVersionId,
    state: 'NEW' as const,
    createdAt: timestamp('2026-01-01T00:00:00.000Z'),
    revision: 1,
  };
  await repository.save(context(workspaceId, 'save'), item);
  await repository.save(context(workspaceId, 'save-replay'), item);
  assert.equal(rows.length, 1);
  await assert.rejects(
    repository.save(
      { ...context(workspaceId, 'save-conflict'), expectedRevision: 1 },
      {
        ...item,
        artifactVersionId: identifier('00000000-0000-4000-8000-000000000009'),
      },
    ),
    /IAE_IMMUTABLE_INBOX_ITEM/u,
  );
});

void test('[IAE-013] Prisma adapter persists only validated state transitions with revisions', async () => {
  const rows: ArtifactIntakeDatabaseRowV1[] = [];
  const repository = new PrismaArtifactIntakeRepositoryAdapter(client(rows));
  const item: InboxItemV1 = {
    schemaVersion: 1 as const,
    inboxItemId: itemId,
    tenantScope: { scopeType: 'workspace' as const, organizationId, workspaceId },
    idempotencyKey: 'transition',
    artifactVersionId,
    state: 'NEW' as const,
    createdAt: timestamp('2026-01-01T00:00:00.000Z'),
    revision: 1,
  };
  await repository.save(context(workspaceId, 'transition-create'), item);
  await repository.save(
    { ...context(workspaceId, 'transition-update'), expectedRevision: 1 },
    { ...item, state: 'ROUTED', revision: 2 },
  );
  assert.equal(
    (await repository.find(context(workspaceId, 'transition-read'), itemId))?.state,
    'ROUTED',
  );
  await assert.rejects(
    repository.save(
      { ...context(workspaceId, 'transition-stale'), expectedRevision: 1 },
      { ...item, state: 'PROCESSING', revision: 2 },
    ),
    /IAE_REVISION_CONFLICT/u,
  );
});
