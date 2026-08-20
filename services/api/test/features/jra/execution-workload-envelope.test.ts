import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  createExecutionWorkloadEnvelopeV1,
  executionWorkloadEnvelopeCanonicalHashV1,
  verifyExecutionWorkloadEnvelopeV1,
} from '../../../src/features/jra/application/execution-workload-envelope.js';
import { createExecutionRequestDescriptorV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function descriptor() {
  const parsed = createExecutionRequestDescriptorV1({
    schemaVersion: 1,
    descriptorId: id('00000000-0000-4000-8000-000000000101'),
    resultUsageSettlementBindingId: id('00000000-0000-4000-8000-000000000106'),
    tenantScope: {
      scopeType: 'workspace',
      organizationId: id('00000000-0000-4000-8000-000000000102'),
      workspaceId: id('00000000-0000-4000-8000-000000000103'),
    },
    jobId: id('00000000-0000-4000-8000-000000000104'),
    stepId: id('00000000-0000-4000-8000-000000000105'),
    action: {
      type: 'dda.materialize.query',
      version: 1,
      inputSchemaId: 'dda.input.v1',
      outputSchemaId: 'dda.output.v1',
      handlerDigest: 'a'.repeat(64),
      requiredCapabilities: ['artifact.read'],
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: ['artifact-version:source-1'],
    inputManifestHash: 'b'.repeat(64),
    parameters: { metric: 'revenue', limit: 100 },
    outputPolicy: {
      outputObjectId: 'artifact-version:result-1',
      maxBytes: 5_000_000,
      mediaType: 'application/json',
    },
    deadline: '2026-01-01T00:01:00.000Z',
    locale: 'vi-VN',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  if (!parsed.accepted) throw new Error('descriptor fixture rejected');
  return parsed.value;
}

function envelope() {
  const parsed = createExecutionWorkloadEnvelopeV1({
    workloadId: id('00000000-0000-4000-8000-000000000107'),
    descriptor: descriptor(),
    attemptId: id('00000000-0000-4000-8000-000000000108'),
    attemptBindingHash: 'c'.repeat(64),
    inputHandles: [
      {
        objectId: 'artifact-version:source-1',
        schemaId: 'artifact.csv.v1',
        contentSha256: 'd'.repeat(64),
        byteLength: 1024,
      },
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    subjectBindings: {
      dashboardId: 'dashboard:one',
      dashboardVersionId: 'dashboard-version:one',
      widgetId: 'widget:revenue',
    },
  });
  if (!parsed.accepted) throw new Error(`workload fixture rejected: ${parsed.code}`);
  return parsed.value;
}

void test('[JRA-033] workload envelope binds immutable descriptor and exact input handles', () => {
  const value = envelope();
  assert.equal(value.descriptorHash, descriptor().canonicalHash);
  assert.equal(value.inputHandles[0]?.objectId, 'artifact-version:source-1');
  assert.equal(value.action.handlerDigest, `sha256:${'a'.repeat(64)}`);
  assert.equal(executionWorkloadEnvelopeCanonicalHashV1(value), value.canonicalHash);
});

void test('[JRA-033] workload hash is key-order independent and changes on input tamper', () => {
  const value = envelope();
  const reordered = {
    ...value,
    subjectBindings: {
      widgetId: 'widget:revenue',
      dashboardVersionId: 'dashboard-version:one',
      dashboardId: 'dashboard:one',
    },
  };
  assert.equal(
    executionWorkloadEnvelopeCanonicalHashV1(reordered),
    executionWorkloadEnvelopeCanonicalHashV1(value),
  );
  assert.notEqual(
    executionWorkloadEnvelopeCanonicalHashV1({
      ...value,
      inputHandles: [{ ...value.inputHandles[0]!, byteLength: 1025 }],
    }),
    value.canonicalHash,
  );
});

void test('[JRA-033] creation rejects descriptor/input/order drift before a worker can run', () => {
  const base = descriptor();
  const rejected = createExecutionWorkloadEnvelopeV1({
    workloadId: id('00000000-0000-4000-8000-000000000107'),
    descriptor: base,
    attemptId: id('00000000-0000-4000-8000-000000000108'),
    attemptBindingHash: 'c'.repeat(64),
    inputHandles: [
      {
        objectId: 'artifact-version:other',
        schemaId: 'artifact.csv.v1',
        contentSha256: 'd'.repeat(64),
        byteLength: 1024,
      },
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    subjectBindings: { dashboardId: 'dashboard:one' },
  });
  assert.deepEqual(rejected, { accepted: false, code: 'JRA_WORKLOAD_DESCRIPTOR_MISMATCH' });
});

void test('[JRA-033] worker verification is exact-scope, exact-attempt, and deadline bounded', () => {
  const value = envelope();
  const identity = {
    workerId: id('00000000-0000-4000-8000-000000000109'),
    tenantScope: value.tenantScope,
    securityEpoch: 1,
    correlationId: id('00000000-0000-4000-8000-000000000110'),
  };
  assert.equal(
    verifyExecutionWorkloadEnvelopeV1(value, {
      identity,
      descriptorId: value.descriptorId,
      descriptorHash: value.descriptorHash,
      attemptId: value.attemptId,
      attemptBindingHash: value.attemptBindingHash,
      now: '2026-01-01T00:00:30.000Z',
    }),
    true,
  );
  assert.equal(
    verifyExecutionWorkloadEnvelopeV1(value, {
      identity: {
        ...identity,
        tenantScope: {
          scopeType: 'workspace',
          organizationId: identity.tenantScope.organizationId,
          workspaceId: id('00000000-0000-4000-8000-000000000111'),
        },
      },
      descriptorId: value.descriptorId,
      descriptorHash: value.descriptorHash,
      attemptId: value.attemptId,
      attemptBindingHash: value.attemptBindingHash,
      now: '2026-01-01T00:00:30.000Z',
    }),
    false,
  );
  assert.equal(
    verifyExecutionWorkloadEnvelopeV1(value, {
      identity,
      descriptorId: value.descriptorId,
      descriptorHash: value.descriptorHash,
      attemptId: value.attemptId,
      attemptBindingHash: value.attemptBindingHash,
      now: '2026-01-01T00:02:00.000Z',
    }),
    false,
  );
});
