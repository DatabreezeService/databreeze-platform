/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { WorkerBoundary } from '../../../src/features/jra/worker/worker-boundary.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../src/features/jra/worker/execution-descriptor-binding.js';
import type {
  WorkerResultPreparationPortV1,
  WorkerResultWriteCapabilityAuthorityPortV1,
} from '../../../src/features/jra/worker/worker-result-preparation.port.js';
import type {
  WorkerAttemptAuthorityPortV1,
  WorkerAuthenticatorPortV1,
} from '../../../src/features/jra/worker/worker-ports.js';

const stable = (value: string) => {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid identifier fixture');
  return parsed.value;
};
const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
});
if (!scopeResult.accepted) throw new Error('invalid scope fixture');
const scope = scopeResult.value;

const ids = {
  worker: stable('00000000-0000-4000-8000-000000000003'),
  job: stable('00000000-0000-4000-8000-000000000004'),
  attempt: stable('00000000-0000-4000-8000-000000000005'),
  descriptor: stable('00000000-0000-4000-8000-000000000006'),
  submission: stable('00000000-0000-4000-8000-000000000007'),
  capability: stable('00000000-0000-4000-8000-000000000008'),
  correlation: stable('00000000-0000-4000-8000-000000000009'),
  settlementBinding: stable('00000000-0000-4000-8000-000000000011'),
  sourceArtifactVersion: stable('00000000-0000-4000-8000-000000000012'),
};
const now = '2026-08-13T00:00:00.000Z';
const leaseExpiresAt = '2026-08-13T00:10:00.000Z';
const utc = (value: string) => {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid time fixture');
  return parsed.value;
};
const descriptorHash = 'a'.repeat(64);
const leaseTokenHash = createHash('sha256').update('worker-lease', 'utf8').digest('hex');
const attemptBindingHash = workerAttemptDescriptorBindingHashV1({
  descriptorHash,
  attemptId: ids.attempt,
  jobId: ids.job,
  workerId: ids.worker,
  securityEpoch: 4,
  leaseExpiresAt,
});
const declaration = {
  kind: 'JSON_RESULT' as const,
  outputName: 'primary',
  schemaId: 'output.v1',
  mediaType: 'application/json',
  contentSha256: '7'.repeat(64),
  byteLength: 512,
  sourceLineageHash: '8'.repeat(64),
};
const identity = {
  workerId: ids.worker,
  tenantScope: scope,
  securityEpoch: 4,
  correlationId: ids.correlation,
} as const;
const attempt = {
  schemaVersion: 1 as const,
  attemptId: ids.attempt,
  jobId: ids.job,
  tenantScope: scope,
  attemptNumber: 1,
  executorType: 'CLOUD_WORKER' as const,
  executorId: ids.worker,
  leaseTokenHash,
  leaseExpiresAt: utc(leaseExpiresAt),
  state: 'RUNNING' as const,
  createdAt: utc(now),
  heartbeatAt: utc(now),
  startedAt: utc(now),
  revision: 1,
};
const job = {
  schemaVersion: 1 as const,
  jobId: ids.job,
  tenantScope: scopeResult.value,
  requestedBy: ids.worker,
  action: {
    schemaVersion: 1 as const,
    actionType: 'typed.test',
    version: 1,
    inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1',
    handlerDigest: 'd'.repeat(64),
    requiredCapabilities: [] as const,
    sideEffectClass: 'NONE' as const,
    riskClass: 'READ_ONLY' as const,
    defaultTimeoutSeconds: 60,
    maxAttempts: 3,
    approvalClass: 'NONE' as const,
  },
  inputManifestHash: 'e'.repeat(64),
  idempotencyKey: 'job-key',
  state: 'RUNNING' as const,
  createdAt: utc(now),
  startedAt: utc(now),
  revision: 2,
};

function boundary(options: { current?: boolean } = {}) {
  const authenticator: WorkerAuthenticatorPortV1 = { authenticate: async () => identity };
  const authority: WorkerAttemptAuthorityPortV1 = {
    authorize: async () =>
      options.current === false
        ? undefined
        : {
            attempt,
            job,
            latestAttemptId: ids.attempt,
            workerSecurityEpoch: 4,
            descriptorId: ids.descriptor,
            descriptorHash,
            attemptBindingHash,
          },
  };
  const preparation: WorkerResultPreparationPortV1 = {
    prepare: async () => ({
      accepted: true,
      replayed: false,
      preparation: {
        submissionId: ids.submission,
        attemptId: ids.attempt,
        jobId: ids.job,
        tenantScope: scope,
        descriptorId: ids.descriptor,
        descriptorHash,
        attemptBindingHash,
        resultUsageSettlementBindingId: ids.settlementBinding,
        outputPolicyHash: 'f'.repeat(64),
        outputSchemaId: 'output.v1',
        subjectBindings: { locale: 'vi-VN' },
        outputs: [
          {
            ...declaration,
            objectId: '00000000-0000-4000-8000-000000000010',
            maxBytes: 1024,
            allowedMediaTypes: ['application/json'],
            sourceArtifactVersionIds: [ids.sourceArtifactVersion],
            processorVersion: 'engine-1.0.0',
            dataMode: 'Cloud',
            payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT',
          },
        ],
      },
    }),
  };
  const capabilities: WorkerResultWriteCapabilityAuthorityPortV1 = {
    issue: async (_identity, input) =>
      input.outputs.map((output) => ({
        ...output,
        capabilityId: ids.capability,
        issuedAt: now,
        expiresAt: leaseExpiresAt,
        signedCapability: 'opaque-signed-capability',
      })),
  };
  return new WorkerBoundary({
    authenticator,
    authority,
    attempts: {} as never,
    grants: {} as never,
    completion: {} as never,
    preparation,
    resultCapabilities: capabilities,
    now: () => now,
  });
}

void test('[JRA-007/JRA-023/JRA-031] preparation returns only descriptor-owned bounded capabilities and does not complete work', async () => {
  const result = await boundary().prepareResult(
    {},
    {
      attemptId: ids.attempt,
      leaseToken: 'worker-lease',
      expectedRevision: 1,
      idempotencyKey: 'stable-submission-key',
      outputs: [declaration],
    },
  );

  assert.deepEqual(result, {
    schemaVersion: 4,
    accepted: true,
    submissionId: ids.submission,
    attemptId: ids.attempt,
    descriptorBindingHash: attemptBindingHash,
    expiresAt: leaseExpiresAt,
    outputs: [
      {
        outputName: 'primary',
        capabilityId: ids.capability,
        objectId: '00000000-0000-4000-8000-000000000010',
        maxBytes: 1024,
        allowedMediaTypes: ['application/json'],
        writeCapability: 'opaque-signed-capability',
      },
    ],
  });
  assert.equal(attempt.state, 'RUNNING');
  assert.equal(job.state, 'RUNNING');
  assert.equal('resultUsageSettlementBindingId' in result, false);
  assert.equal('sourceArtifactVersionIds' in result.outputs[0]!, false);
});

void test('[JRA-007/JRA-031] superseded or stale work receives no result capability', async () => {
  await assert.rejects(
    boundary({ current: false }).prepareResult(
      {},
      {
        attemptId: ids.attempt,
        leaseToken: 'worker-lease',
        expectedRevision: 1,
        idempotencyKey: 'stable-submission-key',
        outputs: [declaration],
      },
    ),
    /WORKER_ATTEMPT_REJECTED/,
  );
});

void test('[JRA-031] legacy complete fails closed for successful result-bearing work', async () => {
  await assert.rejects(
    boundary().complete(
      {},
      {
        attemptId: ids.attempt,
        leaseToken: 'worker-lease',
        expectedRevision: 1,
        outcome: 'SUCCEEDED',
        resultManifestHash: 'f'.repeat(64),
        resultReferences: ['output-object-one'],
      },
    ),
    /WORKER_RESULT_PROTOCOL_REQUIRED/,
  );
});
