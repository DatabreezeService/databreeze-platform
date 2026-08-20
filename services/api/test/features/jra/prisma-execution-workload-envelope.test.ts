import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaExecutionWorkloadEnvelopeAdapter,
  type ExecutionWorkloadEnvelopeDatabaseClientV1,
  type ExecutionWorkloadEnvelopeDatabaseRowV1,
} from '../../../src/features/jra/adapter/prisma-execution-workload-envelope.adapter.js';
import { createExecutionWorkloadEnvelopeV1 } from '../../../src/features/jra/application/execution-workload-envelope.js';
import { createExecutionRequestDescriptorV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function envelope() {
  const descriptor = createExecutionRequestDescriptorV1({
    schemaVersion: 1,
    descriptorId: id('00000000-0000-4000-8000-000000000121'),
    resultUsageSettlementBindingId: id('00000000-0000-4000-8000-000000000122'),
    tenantScope: {
      scopeType: 'workspace',
      organizationId: id('00000000-0000-4000-8000-000000000123'),
      workspaceId: id('00000000-0000-4000-8000-000000000124'),
    },
    jobId: id('00000000-0000-4000-8000-000000000125'),
    stepId: id('00000000-0000-4000-8000-000000000126'),
    action: {
      type: 'dda.materialize.widget-result',
      version: 1,
      inputSchemaId: 'dda-input-v1',
      outputSchemaId: 'dda-output-v4',
      handlerDigest: 'a'.repeat(64),
      requiredCapabilities: ['artifact.read'],
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: ['artifact-version:source-1'],
    inputManifestHash: 'b'.repeat(64),
    parameters: { limit: 100 },
    outputPolicy: {
      outputObjectId: 'artifact-version:result-1',
      maxBytes: 5_000_000,
      mediaType: 'application/json',
    },
    deadline: '2026-01-01T00:01:00.000Z',
    locale: 'vi-VN',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  if (!descriptor.accepted) throw new Error('descriptor fixture rejected');
  const created = createExecutionWorkloadEnvelopeV1({
    workloadId: id('00000000-0000-4000-8000-000000000127'),
    descriptor: descriptor.value,
    attemptId: id('00000000-0000-4000-8000-000000000128'),
    attemptBindingHash: 'c'.repeat(64),
    inputHandles: [
      {
        objectId: 'artifact-version:source-1',
        schemaId: 'artifact/csv',
        contentSha256: 'd'.repeat(64),
        byteLength: 1024,
      },
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    subjectBindings: { dashboardId: 'dashboard:one' },
  });
  if (!created.accepted) throw new Error(`envelope fixture rejected: ${created.code}`);
  return created.value;
}

function database() {
  let stored: ExecutionWorkloadEnvelopeDatabaseRowV1 | null = null;
  const matches = (
    row: ExecutionWorkloadEnvelopeDatabaseRowV1,
    where: Readonly<Record<string, unknown>>,
  ) =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof ExecutionWorkloadEnvelopeDatabaseRowV1] === value,
    );
  const client: ExecutionWorkloadEnvelopeDatabaseClientV1 = {
    executionWorkloadEnvelopeRecord: {
      async findFirst({ where }) {
        return stored !== null && matches(stored, where) ? stored : null;
      },
      async create({ data }) {
        const value = data as unknown as ExecutionWorkloadEnvelopeDatabaseRowV1;
        stored = value;
        return value;
      },
    },
  };
  return {
    client,
    get stored() {
      return stored;
    },
  };
}

function identity(envelopeValue: ReturnType<typeof envelope>) {
  return {
    workerId: id('00000000-0000-4000-8000-000000000129'),
    tenantScope: envelopeValue.tenantScope,
    securityEpoch: 1,
    correlationId: id('00000000-0000-4000-8000-000000000130'),
  };
}

void test('[JRA-033] Prisma envelope persistence is exact-scope and idempotent', async () => {
  const value = envelope();
  const store = database();
  const adapter = new PrismaExecutionWorkloadEnvelopeAdapter(store.client);
  assert.equal(await adapter.save(value), 'SAVED');
  assert.equal(await adapter.save(value), 'REPLAYED');
  assert.equal(store.stored?.canonicalHash, value.canonicalHash);
  const result = await adapter.find({
    identity: identity(value),
    attemptId: value.attemptId,
    descriptorId: value.descriptorId,
    descriptorHash: value.descriptorHash,
    attemptBindingHash: value.attemptBindingHash,
    now: '2026-01-01T00:00:30.000Z',
  });
  assert.equal(result?.canonicalHash, value.canonicalHash);
});

void test('[JRA-033] Prisma envelope resolver denies another workspace and stale deadline', async () => {
  const value = envelope();
  const store = database();
  const adapter = new PrismaExecutionWorkloadEnvelopeAdapter(store.client);
  assert.equal(await adapter.save(value), 'SAVED');
  assert.equal(
    await adapter.find({
      identity: {
        ...identity(value),
        tenantScope: {
          scopeType: 'workspace',
          organizationId: value.tenantScope.organizationId,
          workspaceId: id('00000000-0000-4000-8000-000000000131'),
        },
      },
      attemptId: value.attemptId,
      descriptorId: value.descriptorId,
      descriptorHash: value.descriptorHash,
      attemptBindingHash: value.attemptBindingHash,
      now: '2026-01-01T00:00:30.000Z',
    }),
    undefined,
  );
  assert.equal(
    await adapter.find({
      identity: identity(value),
      attemptId: value.attemptId,
      descriptorId: value.descriptorId,
      descriptorHash: value.descriptorHash,
      attemptBindingHash: value.attemptBindingHash,
      now: '2026-01-01T00:02:00.000Z',
    }),
    undefined,
  );
});
