import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createProtectedDocumentUnlockRequestV1 } from '@databreeze/domain/protected-document/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaProtectedDocumentUnlockRepositoryAdapter,
  type ProtectedDocumentUnlockDatabaseClientV1,
  type ProtectedDocumentUnlockDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-protected-document-unlock-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-protected-document',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const created = createProtectedDocumentUnlockRequestV1({
  requestId: '55555555-5555-4555-8555-555555555555',
  artifactVersionId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  mode: 'LOCAL_SECRET_INPUT',
  createdAt: '2026-08-04T00:00:00.000Z',
  expiresAt: '2026-08-04T00:20:00.000Z',
});
if (!created.accepted) throw new Error('fixture unlock invalid');

function client(
  rows: ProtectedDocumentUnlockDatabaseRowV1[],
): ProtectedDocumentUnlockDatabaseClientV1 {
  return {
    protectedDocumentUnlockRequestRecord: {
      create({ data }) {
        const row = { ...data } as ProtectedDocumentUnlockDatabaseRowV1;
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      update({ where, data }) {
        const current = rows.find((row) => row.id === where.id);
        if (!current) throw new Error('fixture unlock not found');
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

void test('IAE-015 Prisma unlock adapter persists state without credentials', async () => {
  const rows: ProtectedDocumentUnlockDatabaseRowV1[] = [];
  const repository = new PrismaProtectedDocumentUnlockRepositoryAdapter(client(rows));
  await repository.save(context, created.value);
  const found = await repository.find(context, created.value.requestId);
  assert.deepEqual(found, created.value);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row);
  assert.equal(Object.hasOwn(row, 'secret'), false);
  assert.equal(Object.hasOwn(row, 'password'), false);
});
