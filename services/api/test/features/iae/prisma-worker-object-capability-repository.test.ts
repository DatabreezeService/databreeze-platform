/* eslint-disable @typescript-eslint/require-await -- deterministic Prisma delegate double. */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseStableIdentifierV1, parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaWorkerObjectCapabilityRepositoryAdapter,
  type WorkerObjectCapabilityDatabaseClientV1,
  type WorkerObjectCapabilityDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-worker-object-capability-repository.adapter.js';

const ids = Object.freeze({
  organizationId: '00000000-0000-4000-8000-000000000721',
  workspaceId: '00000000-0000-4000-8000-000000000722',
  otherWorkspaceId: '00000000-0000-4000-8000-000000000723',
  jobId: '00000000-0000-4000-8000-000000000724',
  attemptId: '00000000-0000-4000-8000-000000000725',
  workerId: '00000000-0000-4000-8000-000000000726',
  capabilityId: '00000000-0000-4000-8000-000000000727',
});
const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
});
const otherScopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.otherWorkspaceId,
});
if (!scopeResult.accepted || !otherScopeResult.accepted) throw new Error('invalid test scope');
const scope = scopeResult.value;
const otherScope = otherScopeResult.value;

function row(overrides: Partial<WorkerObjectCapabilityDatabaseRowV1> = {}) {
  return {
    id: ids.capabilityId,
    grantType: 'JOB_INPUT',
    attemptId: ids.attemptId,
    jobId: ids.jobId,
    workerId: ids.workerId,
    scopeType: 'workspace',
    organizationId: ids.organizationId,
    workspaceId: ids.workspaceId,
    projectId: null,
    objectId: null,
    objectIds: ['source-object-000001'],
    objectBindings: [
      {
        objectId: 'source-object-000001',
        contentSha256: 'a'.repeat(64),
        contentLength: 4096,
      },
    ],
    action: 'READ',
    securityEpoch: 3,
    maxBytes: BigInt(4096),
    issuedAt: new Date('2026-08-13T00:00:00.000Z'),
    expiresAt: new Date('2026-08-13T00:05:00.000Z'),
    revokedAt: null,
    contentSha256: null,
    contentLength: null,
    transferredAt: null,
    ...overrides,
  } satisfies WorkerObjectCapabilityDatabaseRowV1;
}

function client(): WorkerObjectCapabilityDatabaseClientV1 {
  const rows = new Map<string, WorkerObjectCapabilityDatabaseRowV1>();
  const matches = (
    candidate: WorkerObjectCapabilityDatabaseRowV1,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'revokedAt' && value === null) return candidate.revokedAt === null;
      return candidate[key as keyof WorkerObjectCapabilityDatabaseRowV1] === value;
    });
  const value: WorkerObjectCapabilityDatabaseClientV1 = {
    workerObjectCapabilityRecord: {
      findFirst: async ({ where }) =>
        [...rows.values()].find((candidate) =>
          matches(candidate, where as Record<string, unknown>),
        ) ?? null,
      findUnique: async ({ where }) => rows.get(where.id) ?? null,
      create: async ({ data }) => {
        const created = data as unknown as WorkerObjectCapabilityDatabaseRowV1;
        rows.set(created.id, created);
        return created;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [key, candidate] of rows) {
          if (!matches(candidate, where as Record<string, unknown>)) continue;
          rows.set(key, {
            ...candidate,
            ...(data as Partial<WorkerObjectCapabilityDatabaseRowV1>),
          });
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async (work) => work(value),
  };
  return value;
}

void test('[IAE-008, JRA-006, JRA-023] Prisma capability adapter persists exact scope and revocation receipts', async () => {
  const database = client();
  const repository = new PrismaWorkerObjectCapabilityRepositoryAdapter(database);
  const parsedAttempt = parseStableIdentifierV1(ids.attemptId);
  if (!parsedAttempt.accepted) throw new Error('invalid test attempt');

  await repository.save({
    schemaVersion: 1,
    grantType: 'JOB_INPUT',
    capabilityId: ids.capabilityId as never,
    attemptId: parsedAttempt.value,
    jobId: ids.jobId as never,
    workerId: ids.workerId as never,
    securityEpoch: 3,
    tenantScope: scope,
    objectIds: ['source-object-000001'],
    objectBindings: [
      {
        objectId: 'source-object-000001',
        contentSha256: 'a'.repeat(64),
        contentLength: 4096,
      },
    ],
    action: 'READ',
    maxBytes: 4096,
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2026-08-13T00:05:00.000Z' as never,
  });
  const found = await repository.findInput(scope, parsedAttempt.value);
  assert.equal(found?.attemptId, ids.attemptId);
  assert.deepEqual(found?.objectIds, ['source-object-000001']);
  assert.equal(await repository.findInput(otherScope, parsedAttempt.value), undefined);

  await repository.revokeForAttempt(
    scope,
    parsedAttempt.value,
    '2026-08-13T00:01:00.000Z' as never,
  );
  const revoked = await repository.findInput(scope, parsedAttempt.value);
  assert.equal(revoked?.revokedAt, '2026-08-13T00:01:00.000Z');
});

void test('rejects persisted capability rows that contain unsafe object references', async () => {
  const database = client();
  const repository = new PrismaWorkerObjectCapabilityRepositoryAdapter(database);
  const parsedAttempt = parseStableIdentifierV1(ids.attemptId);
  if (!parsedAttempt.accepted) throw new Error('invalid test attempt');
  await database.workerObjectCapabilityRecord.create({
    data: row({ objectIds: ['C:\\secret.csv'] }),
  });
  await assert.rejects(
    repository.findInput(scope, parsedAttempt.value),
    /IAE_PERSISTED_CAPABILITY_OBJECTS_INVALID/,
  );
});

void test('[IAE-002, JRA-023] Prisma capability adapter records one immutable output receipt', async () => {
  const database = client();
  const repository = new PrismaWorkerObjectCapabilityRepositoryAdapter(database);
  const parsedAttempt = parseStableIdentifierV1(ids.attemptId);
  if (!parsedAttempt.accepted) throw new Error('invalid test attempt');
  await repository.save({
    schemaVersion: 1,
    grantType: 'JOB_OUTPUT',
    capabilityId: ids.capabilityId as never,
    attemptId: parsedAttempt.value,
    jobId: ids.jobId as never,
    workerId: ids.workerId as never,
    securityEpoch: 3,
    tenantScope: scope,
    objectIds: ['result-object-000001'],
    objectBindings: [{ objectId: 'result-object-000001' }],
    action: 'WRITE',
    maxBytes: 4096,
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2026-08-13T00:05:00.000Z' as never,
  });
  const receipt = {
    objectId: 'result-object-000001',
    contentSha256: 'f'.repeat(64),
    contentLength: 128,
    transferredAt: '2026-08-13T00:01:00.000Z' as never,
  };
  assert.equal(
    await repository.recordTransferReceipt(scope, ids.capabilityId as never, receipt),
    'RECORDED',
  );
  assert.equal(
    await repository.recordTransferReceipt(scope, ids.capabilityId as never, receipt),
    'REPLAYED',
  );
  assert.deepEqual(
    (await repository.findByCapability(scope, ids.capabilityId as never))?.transferReceipt,
    receipt,
  );
  assert.equal(
    await repository.recordTransferReceipt(scope, ids.capabilityId as never, {
      ...receipt,
      contentSha256: 'e'.repeat(64),
    }),
    'CONFLICT',
  );
});
