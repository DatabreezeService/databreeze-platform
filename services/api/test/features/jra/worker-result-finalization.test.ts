/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { parseStableIdentifierV1, parseStrictUtcTimestampV1, parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { WorkerBoundary } from '../../../src/features/jra/worker/worker-boundary.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../src/features/jra/worker/execution-descriptor-binding.js';
import type {
  WorkerResultAttestationResolverPortV1,
  WorkerResultFinalizationPortV1,
} from '../../../src/features/jra/worker/worker-result-finalization.port.js';
import type { WorkerAttemptAuthorityPortV1 } from '../../../src/features/jra/worker/worker-ports.js';

const stable = (value: string) => {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid identifier fixture');
  return parsed.value;
};
const parsedScope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
});
if (!parsedScope.accepted) throw new Error('invalid scope fixture');
const id = (suffix: string) => stable(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);
const now = '2026-08-13T00:00:00.000Z';
const utc = (value: string) => {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid timestamp fixture');
  return parsed.value;
};
const descriptorHash = 'a'.repeat(64);
const identity = { workerId: id('3'), tenantScope: parsedScope.value, securityEpoch: 4, correlationId: id('9') } as const;
const leaseTokenHash = createHash('sha256').update('worker-lease', 'utf8').digest('hex');
const attemptBindingHash = workerAttemptDescriptorBindingHashV1({
  descriptorHash, attemptId: id('5'), jobId: id('4'), workerId: identity.workerId,
  securityEpoch: 4, leaseExpiresAt: '2026-08-13T00:10:00.000Z',
});
const attempt = {
  schemaVersion: 1 as const, attemptId: id('5'), jobId: id('4'), tenantScope: parsedScope.value,
  attemptNumber: 1, executorType: 'CLOUD_WORKER' as const, executorId: identity.workerId,
  leaseTokenHash, leaseExpiresAt: utc('2026-08-13T00:10:00.000Z'), state: 'RUNNING' as const,
  createdAt: utc(now), heartbeatAt: utc(now), startedAt: utc(now), revision: 1,
};
const job = {
  schemaVersion: 1 as const, jobId: id('4'), tenantScope: parsedScope.value, requestedBy: identity.workerId,
  action: { schemaVersion: 1 as const, actionType: 'typed.test', version: 1, inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1', handlerDigest: 'd'.repeat(64), requiredCapabilities: [] as const,
    sideEffectClass: 'NONE' as const, riskClass: 'READ_ONLY' as const, defaultTimeoutSeconds: 60,
    maxAttempts: 3, approvalClass: 'NONE' as const },
  inputManifestHash: 'e'.repeat(64), idempotencyKey: 'job-key', state: 'RUNNING' as const,
  createdAt: utc(now), startedAt: utc(now), revision: 2,
};

void test('[JRA-012/JRA-023/JRA-031] finalization resolves attestation IDs server-side before committing', async () => {
  let resolved = false;
  let committed = false;
  const authority: WorkerAttemptAuthorityPortV1 = { authorize: async () => ({
    attempt, job, latestAttemptId: attempt.attemptId, workerSecurityEpoch: 4,
    descriptorId: id('6'), descriptorHash, attemptBindingHash,
  }) };
  const attestations: WorkerResultAttestationResolverPortV1 = {
    resolveAttestation: async ({ attestationId }) => {
      resolved = true;
      assert.equal(attestationId, id('10'));
      return { schemaVersion: 1, attestationId: id('10'), tenantScope: parsedScope.value, jobId: job.jobId,
        attemptId: attempt.attemptId, executionDescriptorId: id('6'), submissionId: id('7'),
        executionDescriptorHash: descriptorHash, outputPolicyHash: '3'.repeat(64),
        artifactVersionId: id('11'), contentSha256: 'f'.repeat(64), contentLength: 512,
        mediaType: 'application/json', sourceLineageHash: '1'.repeat(64), finalizedAt: utc(now) };
    },
  };
  const finalization: WorkerResultFinalizationPortV1 = {
    findResultReplay: async () => undefined,
    finalize: async (input) => {
      assert.equal(resolved, true);
      assert.equal(input.attestations[0]?.artifactVersionId, id('11'));
      committed = true;
      return { accepted: true, replayed: false, completion: {
        submissionId: id('7'), resultManifestId: id('12'), resultManifestHash: '2'.repeat(64),
        attemptId: attempt.attemptId, jobId: job.jobId, outcome: 'SUCCEEDED', attemptRevision: 2,
        jobRevision: 3, artifactVersionIds: [id('11')],
      } };
    },
  };
  const boundary = new WorkerBoundary({
    authenticator: { authenticate: async () => identity }, authority, attempts: {} as never,
    grants: {} as never, completion: {} as never, finalization, attestations, now: () => now,
  });

  const result = await boundary.finalizeResult({}, {
    attemptId: attempt.attemptId, leaseToken: 'worker-lease', expectedRevision: 1,
    submissionId: id('7'), descriptorBindingHash: attemptBindingHash, idempotencyKey: 'finalize-key',
    attestations: [{ outputName: 'primary', attestationId: id('10') }],
    resultBinding: { kind: 'OUTPUT_SET', outputSchemaId: 'output.v1', outputNames: ['primary'] },
  });

  assert.equal(committed, true);
  assert.equal(result.resultManifestId, id('12'));
});
