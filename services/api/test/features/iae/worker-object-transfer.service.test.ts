/* eslint-disable @typescript-eslint/require-await -- deterministic IAE port doubles. */
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import { createJobV1, createTypedActionDefinitionV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { HmacWorkerCapabilitySignerAdapter } from '../../../src/features/iae/adapter/hmac-worker-capability-signer.adapter.js';
import { InMemoryWorkerObjectByteStoreAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-byte-store.adapter.js';
import { InMemoryWorkerObjectCapabilityRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-capability-repository.adapter.js';
import type {
  IaeWorkerInputObjectResolverPortV1,
  IaeWorkerOutputObjectResolverPortV1,
  IaeWorkerSecurityEpochPortV1,
} from '../../../src/features/iae/application/worker-object-capability.port.js';
import { IaeWorkerObjectCapabilityService } from '../../../src/features/iae/application/worker-object-capability.service.js';
import { IaeWorkerObjectTransferService } from '../../../src/features/iae/application/worker-object-transfer.service.js';

const ids = Object.freeze({
  organizationId: '00000000-0000-4000-8000-000000000801',
  workspaceId: '00000000-0000-4000-8000-000000000802',
  otherWorkspaceId: '00000000-0000-4000-8000-000000000803',
  actorId: '00000000-0000-4000-8000-000000000804',
  workerId: '00000000-0000-4000-8000-000000000805',
  otherWorkerId: '00000000-0000-4000-8000-000000000806',
  jobId: '00000000-0000-4000-8000-000000000807',
  attemptId: '00000000-0000-4000-8000-000000000808',
  otherAttemptId: '00000000-0000-4000-8000-000000000809',
  inputObjectId: 'source-object-000801',
  outputObjectId: 'result-object-000801',
  correlationId: '00000000-0000-4000-8000-000000000810',
});

const issuedAt = '2026-08-13T00:00:00.000Z';
const inputBytes = new TextEncoder().encode('amount,currency\n125000,VND\n');
const inputSha256 = createHash('sha256').update(inputBytes).digest('hex');
const outputBytes = new TextEncoder().encode('{"total":125000}');
const outputSha256 = createHash('sha256').update(outputBytes).digest('hex');

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(`invalid test identifier ${value}`);
  return parsed.value;
}

function scope(workspaceId: string = ids.workspaceId): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: 'workspace',
    organizationId: ids.organizationId,
    workspaceId,
  });
  if (!parsed.accepted) throw new Error('invalid test scope');
  return parsed.value;
}

function fixture() {
  const tenantScope = scope();
  const action = createTypedActionDefinitionV1({
    actionType: 'iae.worker.transfer.test',
    version: 1,
    inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1',
    handlerDigest: 'a'.repeat(64),
    requiredCapabilities: [],
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 60,
    maxAttempts: 2,
    approvalClass: 'NONE',
  });
  if (!action.accepted) throw new Error('invalid test action');
  const job = createJobV1({
    jobId: ids.jobId,
    tenantScope,
    requestedBy: ids.actorId,
    action: action.value,
    inputManifestHash: 'b'.repeat(64),
    idempotencyKey: 'iae-worker-transfer-test',
    createdAt: issuedAt,
  });
  if (!job.accepted) throw new Error('invalid test job');
  const attempt = createExecutionAttemptV1({
    attemptId: ids.attemptId,
    jobId: ids.jobId,
    tenantScope,
    attemptNumber: 1,
    executorType: 'CLOUD_WORKER',
    executorId: ids.workerId,
    leaseTokenHash: 'c'.repeat(64),
    leaseExpiresAt: '2026-08-13T00:10:00.000Z',
    createdAt: issuedAt,
  });
  if (!attempt.accepted) throw new Error('invalid test attempt');

  const repository = new InMemoryWorkerObjectCapabilityRepositoryAdapter();
  const signer = new HmacWorkerCapabilitySignerAdapter('worker-transfer-test-secret'.repeat(2));
  const epoch: IaeWorkerSecurityEpochPortV1 = {
    isCurrent: async (identity) => identity.securityEpoch === 11,
  };
  const inputResolver: IaeWorkerInputObjectResolverPortV1 = {
    resolveInputObjects: async () => ({
      accepted: true,
      value: {
        objects: [
          {
            objectId: ids.inputObjectId,
            contentSha256: inputSha256,
            contentLength: inputBytes.byteLength,
          },
        ],
        maxBytes: 4096,
      },
    }),
  };
  const outputResolver: IaeWorkerOutputObjectResolverPortV1 = {
    isResultObjectAllowed: async ({ objectId }) => objectId === ids.outputObjectId,
  };
  const capabilities = new IaeWorkerObjectCapabilityService(
    repository,
    inputResolver,
    outputResolver,
    signer,
    epoch,
    () => issuedAt,
  );
  const objects = new InMemoryWorkerObjectByteStoreAdapter([
    {
      tenantScope,
      objectId: ids.inputObjectId,
      bytes: inputBytes,
      contentSha256: inputSha256,
      contentLength: inputBytes.byteLength,
    },
  ]);
  const transfers = new IaeWorkerObjectTransferService(
    repository,
    signer,
    epoch,
    objects,
    () => issuedAt,
  );
  const identity = Object.freeze({
    workerId: stable(ids.workerId),
    tenantScope,
    securityEpoch: 11,
    correlationId: stable(ids.correlationId),
  });
  return {
    repository,
    capabilities,
    transfers,
    objects,
    identity,
    job: job.value,
    attempt: attempt.value,
  };
}

void test('[IAE-002, IAE-008, JRA-023] reads only the exact signed attempt-bound object and verifies its bytes', async () => {
  const subject = fixture();
  const grant = await subject.capabilities.issueInputGrant(
    subject.identity,
    subject.job,
    subject.attempt,
    issuedAt,
  );
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;

  const read = await subject.transfers.read(subject.identity, {
    capabilityId: grant.value.capabilityId,
    signedCapability: grant.value.signedCapability,
    attemptId: ids.attemptId,
    objectId: ids.inputObjectId,
    now: issuedAt,
  });

  assert.equal(read.accepted, true);
  if (!read.accepted) return;
  assert.deepEqual(read.value.bytes, inputBytes);
  assert.equal(read.value.objectId, ids.inputObjectId);
  assert.equal(read.value.contentSha256, inputSha256);
  assert.equal(read.value.contentLength, inputBytes.byteLength);
  assert.equal('url' in read.value, false);
  assert.equal('key' in read.value, false);
  assert.equal('credential' in read.value, false);
});

void test('[IAE-008, JRA-023] rejects tampered tenant, worker, attempt, object, signature, expiry, and epoch', async () => {
  const subject = fixture();
  const grant = await subject.capabilities.issueInputGrant(
    subject.identity,
    subject.job,
    subject.attempt,
    issuedAt,
  );
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  const base = {
    capabilityId: grant.value.capabilityId,
    signedCapability: grant.value.signedCapability,
    attemptId: ids.attemptId,
    objectId: ids.inputObjectId,
    now: issuedAt,
  } as const;

  const cases = [
    await subject.transfers.read(
      { ...subject.identity, tenantScope: scope(ids.otherWorkspaceId) },
      base,
    ),
    await subject.transfers.read(
      { ...subject.identity, workerId: stable(ids.otherWorkerId) },
      base,
    ),
    await subject.transfers.read(subject.identity, { ...base, attemptId: ids.otherAttemptId }),
    await subject.transfers.read(subject.identity, { ...base, objectId: ids.outputObjectId }),
    await subject.transfers.read(subject.identity, {
      ...base,
      signedCapability: `${grant.value.signedCapability}tampered`,
    }),
    await subject.transfers.read(subject.identity, {
      ...base,
      now: '2026-08-13T00:06:00.000Z',
    }),
    await subject.transfers.read({ ...subject.identity, securityEpoch: 12 }, base),
  ];

  assert.deepEqual(
    cases.map((result) => (result.accepted ? 'ACCEPTED' : result.code)),
    [
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
      'TRANSFER_DENIED',
    ],
  );
});

void test('[IAE-002, JRA-006, JRA-023] writes one exact immutable result with verified length and SHA-256', async () => {
  const subject = fixture();
  const grants = await subject.capabilities.acceptResultReferences(
    subject.identity,
    subject.job,
    subject.attempt,
    [ids.outputObjectId],
    issuedAt,
  );
  assert.equal(grants.accepted, true);
  if (!grants.accepted) return;
  const grant = grants.value[0];
  assert.ok(grant);
  const command = {
    capabilityId: grant.capabilityId,
    signedCapability: grant.signedCapability,
    attemptId: ids.attemptId,
    objectId: ids.outputObjectId,
    bytes: outputBytes,
    contentSha256: outputSha256,
    contentLength: outputBytes.byteLength,
    now: issuedAt,
  } as const;

  const written = await subject.transfers.write(subject.identity, command);
  assert.equal(written.accepted, true);
  if (!written.accepted) return;
  assert.equal(written.value.contentSha256, outputSha256);
  assert.equal(written.value.contentLength, outputBytes.byteLength);

  const replay = await subject.transfers.write(subject.identity, command);
  assert.deepEqual(replay, written);

  const changedBytes = new TextEncoder().encode('{"total":130000}');
  const changed = await subject.transfers.write(subject.identity, {
    ...command,
    bytes: changedBytes,
    contentSha256: createHash('sha256').update(changedBytes).digest('hex'),
    contentLength: changedBytes.byteLength,
  });
  assert.deepEqual(changed, { accepted: false, code: 'TRANSFER_REPLAY' });

  const stored = await subject.objects.readExact({
    tenantScope: subject.identity.tenantScope,
    objectId: ids.outputObjectId,
    maximumByteLength: 1024,
  });
  assert.equal(stored.accepted, true);
  if (!stored.accepted) return;
  assert.deepEqual(stored.value.bytes, outputBytes);
});

void test('[IAE-002, JRA-023] rejects false content claims and never persists the result', async () => {
  const subject = fixture();
  const grants = await subject.capabilities.acceptResultReferences(
    subject.identity,
    subject.job,
    subject.attempt,
    [ids.outputObjectId],
    issuedAt,
  );
  assert.equal(grants.accepted, true);
  if (!grants.accepted) return;
  const grant = grants.value[0];
  assert.ok(grant);

  const wrongHash = await subject.transfers.write(subject.identity, {
    capabilityId: grant.capabilityId,
    signedCapability: grant.signedCapability,
    attemptId: ids.attemptId,
    objectId: ids.outputObjectId,
    bytes: outputBytes,
    contentSha256: '0'.repeat(64),
    contentLength: outputBytes.byteLength,
    now: issuedAt,
  });
  assert.deepEqual(wrongHash, { accepted: false, code: 'CONTENT_HASH_MISMATCH' });

  const wrongLength = await subject.transfers.write(subject.identity, {
    capabilityId: grant.capabilityId,
    signedCapability: grant.signedCapability,
    attemptId: ids.attemptId,
    objectId: ids.outputObjectId,
    bytes: outputBytes,
    contentSha256: outputSha256,
    contentLength: outputBytes.byteLength + 1,
    now: issuedAt,
  });
  assert.deepEqual(wrongLength, { accepted: false, code: 'CONTENT_LENGTH_MISMATCH' });

  const absent = await subject.objects.readExact({
    tenantScope: subject.identity.tenantScope,
    objectId: ids.outputObjectId,
    maximumByteLength: 1024,
  });
  assert.deepEqual(absent, { accepted: false, code: 'OBJECT_NOT_FOUND' });
});
