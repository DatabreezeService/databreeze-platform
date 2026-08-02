import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createEvidenceAccessGrantV1 } from '@databreeze/domain/evidence-grant/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaEvidenceGrantRepositoryAdapter,
  type EvidenceGrantDatabaseClientV1,
  type EvidenceGrantDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-evidence-grant-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-grant',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;
const grantResult = createEvidenceAccessGrantV1({
  grantId: '55555555-5555-4555-8555-555555555555',
  evidenceId: '66666666-6666-4666-8666-666666666666',
  artifactVersionId: '77777777-7777-4777-8777-777777777777',
  tenantScope: context.tenantScope,
  recipientDeviceId: '88888888-8888-4888-8888-888888888888',
  action: 'COORDINATE',
  issuedAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-02T00:05:00.000Z',
  authorizationEpoch: 1,
  artifactDataMode: 'Hybrid',
  sourceState: 'AVAILABLE',
});
if (!grantResult.accepted) throw new Error('fixture grant invalid');
const grant = grantResult.value;

function client(rows: EvidenceGrantDatabaseRowV1[]): EvidenceGrantDatabaseClientV1 {
  return {
    evidenceGrantRecord: {
      create({ data }) {
        const row = { ...data } as EvidenceGrantDatabaseRowV1;
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      update({ where, data }) {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('fixture grant not found');
        const next = { ...row, ...data };
        rows[rows.indexOf(row)] = next;
        return Promise.resolve(next);
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('IAE-005 Prisma grant adapter persists immutable grants and revocation', async () => {
  const rows: EvidenceGrantDatabaseRowV1[] = [];
  const repository = new PrismaEvidenceGrantRepositoryAdapter(client(rows));
  await repository.save(context, grant);
  await repository.save(context, grant);
  assert.deepEqual(await repository.find(context, grant.grantId), grant);
  assert.equal(await repository.isRevoked(context, grant.grantId), false);
  await repository.revoke(context, grant.grantId);
  await repository.revoke(context, grant.grantId);
  assert.equal(await repository.isRevoked(context, grant.grantId), true);
  assert.equal(rows.length, 1);
});
