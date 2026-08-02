import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
} from '@databreeze/domain/artifact-upload/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaArtifactUploadRepositoryAdapter,
  type ArtifactUploadDatabaseClientV1,
  type ArtifactUploadDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-upload-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-upload',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;
const created = createArtifactUploadSessionV1({
  sessionId: '55555555-5555-4555-8555-555555555555',
  artifactId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  expectedSha256: 'a'.repeat(64),
  expectedByteSize: 4,
  mediaType: 'application/octet-stream',
  partSize: 4,
  createdAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-02T01:00:00.000Z',
});
if (!created.accepted) throw new Error('fixture upload invalid');
const part = recordArtifactUploadPartV1(created.value, {
  partNumber: 1,
  contentSha256: 'b'.repeat(64),
  byteSize: 4,
  uploadedAt: '2026-08-02T00:10:00.000Z',
  expectedRevision: 1,
});
if (!part.accepted) throw new Error('fixture part invalid');

function client(rows: ArtifactUploadDatabaseRowV1[]): ArtifactUploadDatabaseClientV1 {
  return {
    artifactUploadSessionRecord: {
      create({ data }) {
        const row = {
          ...data,
          expectedByteSize: data.expectedByteSize,
        } as ArtifactUploadDatabaseRowV1;
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      update({ where, data }) {
        const current = rows.find((row) => row.id === where.id);
        if (!current) throw new Error('fixture upload not found');
        const next = { ...current, ...data };
        rows[rows.indexOf(current)] = next;
        return Promise.resolve(next);
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('IAE-014 Prisma upload adapter preserves parts, revisions, and immutable identity', async () => {
  const rows: ArtifactUploadDatabaseRowV1[] = [];
  const repository = new PrismaArtifactUploadRepositoryAdapter(client(rows));
  await repository.save(context, created.value);
  await repository.save(context, created.value);
  await repository.save(context, part.value);
  assert.deepEqual(await repository.find(context, created.value.sessionId), part.value);
  assert.equal(rows.length, 1);
});
