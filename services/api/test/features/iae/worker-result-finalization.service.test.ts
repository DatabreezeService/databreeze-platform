import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic authority/repository doubles. */

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IaeWorkerCapabilityRecordV1 } from '../../../src/features/iae/application/worker-object-capability.port.js';
import {
  IaeWorkerResultFinalizationService,
  type IaeWorkerResultFinalizationRepositoryPortV1,
  type IaeWorkerResultFinalizationTransactionPortV1,
} from '../../../src/features/iae/application/worker-result-finalization.service.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000a01',
  workspace: '00000000-0000-4000-8000-000000000a02',
  worker: '00000000-0000-4000-8000-000000000a03',
  correlation: '00000000-0000-4000-8000-000000000a04',
  capability: '00000000-0000-4000-8000-000000000a05',
  job: '00000000-0000-4000-8000-000000000a06',
  attempt: '00000000-0000-4000-8000-000000000a07',
  descriptor: '00000000-0000-4000-8000-000000000a08',
  submission: '00000000-0000-4000-8000-000000000a09',
  artifact: '00000000-0000-4000-8000-000000000a10',
  version: '00000000-0000-4000-8000-000000000a11',
  placement: '00000000-0000-4000-8000-000000000a12',
  source: '00000000-0000-4000-8000-000000000a13',
  attestation: '00000000-0000-4000-8000-000000000a14',
  lineage: '00000000-0000-4000-8000-000000000a15',
} as const;

const parsedScope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organization,
  workspaceId: ids.workspace,
});
if (!parsedScope.accepted) throw new Error('invalid scope fixture');
const tenantScope = parsedScope.value;
const contentSha256 = 'a'.repeat(64);
const sourceLineageHash = createHash('sha256')
  .update(JSON.stringify({ sourceArtifactVersionIds: [ids.source], processorVersion: 'engine@1' }))
  .digest('hex');

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid identifier fixture');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid timestamp fixture');
  return parsed.value;
}

function capability(
  overrides: Partial<IaeWorkerCapabilityRecordV1> = {},
): IaeWorkerCapabilityRecordV1 {
  return {
    schemaVersion: 1,
    grantType: 'JOB_OUTPUT',
    capabilityId: stable(ids.capability),
    attemptId: stable(ids.attempt),
    jobId: stable(ids.job),
    workerId: stable(ids.worker),
    securityEpoch: 4,
    tenantScope,
    objectIds: ['result.json'],
    objectBindings: [{ objectId: 'result.json' }],
    action: 'WRITE',
    maxBytes: 4096,
    issuedAt: timestamp('2026-08-13T00:00:00.000Z'),
    expiresAt: timestamp('2026-08-13T00:10:00.000Z'),
    transferReceipt: {
      objectId: 'result.json',
      contentSha256,
      contentLength: 128,
      transferredAt: timestamp('2026-08-13T00:01:00.000Z'),
    },
    resultFinalizationBinding: {
      submissionId: stable(ids.submission),
      executionDescriptorId: stable(ids.descriptor),
      executionDescriptorHash: 'e'.repeat(64),
      artifactId: stable(ids.artifact),
      artifactVersionId: stable(ids.version),
      placementId: stable(ids.placement),
      lineageId: stable(ids.lineage),
      objectId: 'result.json',
      mediaType: 'application/json',
      contentSha256,
      contentLength: 128,
      payloadClass: 'APPROVED_DERIVED_RESULT',
      dataMode: 'Cloud',
      sourceArtifactVersionIds: [stable(ids.source)],
      sourceLineageHash,
      outputPolicyHash: 'f'.repeat(64),
      processorVersion: 'engine@1',
    },
    ...overrides,
  };
}

function identity() {
  return {
    workerId: stable(ids.worker),
    tenantScope,
    securityEpoch: 4,
    correlationId: stable(ids.correlation),
  } as const;
}

function command(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    submissionId: stable(ids.submission),
    capabilityId: stable(ids.capability),
    signedCapability: 'opaque-current-capability',
    attemptId: stable(ids.attempt),
    executionDescriptorId: stable(ids.descriptor),
    objectId: 'result.json',
    contentSha256,
    contentLength: 128,
    mediaType: 'application/json',
    ...overrides,
  };
}

function subject(
  options: {
    readonly capability?: IaeWorkerCapabilityRecordV1;
    readonly epochCurrent?: boolean;
    readonly signatureCurrent?: boolean;
  } = {},
) {
  let stored:
    | Parameters<IaeWorkerResultFinalizationTransactionPortV1['saveFinalization']>[0]
    | undefined;
  const transaction: IaeWorkerResultFinalizationTransactionPortV1 = {
    findCapability: async () => options.capability ?? capability(),
    findAttestationBySubmission: async () =>
      stored === undefined
        ? undefined
        : { requestHash: stored.requestHash, attestation: stored.attestation },
    saveFinalization: async (input) => {
      stored = input;
    },
  };
  const repository: IaeWorkerResultFinalizationRepositoryPortV1 = {
    withTransaction: (_scope, work) => work(transaction),
    findAttestationBySubmission: async () =>
      stored === undefined
        ? undefined
        : { requestHash: stored.requestHash, attestation: stored.attestation },
  };
  const service = new IaeWorkerResultFinalizationService(
    repository,
    { verify: async () => options.signatureCurrent ?? true },
    { isCurrent: async () => options.epochCurrent ?? true },
    (() => {
      const values = [ids.attestation, ids.lineage];
      return () => values.shift() ?? ids.lineage;
    })(),
    () => '2026-08-13T00:02:00.000Z',
  );
  return { service, stored: () => stored };
}

void test('[IAE-024] exact receipt and prepared bindings create one content-free attestation', async () => {
  const fixture = subject();
  const result = await fixture.service.finalize(identity(), command());

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.artifactVersionId, ids.version);
  assert.equal(result.value.contentSha256, contentSha256);
  assert.equal(result.value.contentLength, 128);
  assert.equal(result.value.executionDescriptorId, ids.descriptor);
  assert.equal(result.value.executionDescriptorHash, 'e'.repeat(64));
  assert.equal(result.value.attemptId, ids.attempt);
  assert.equal(result.value.submissionId, ids.submission);
  assert.equal(result.value.sourceLineageHash, sourceLineageHash);
  assert.equal(result.value.outputPolicyHash, 'f'.repeat(64));
  assert.equal('objectId' in result.value, false);
  assert.equal('signedCapability' in result.value, false);
  assert.equal(fixture.stored()?.artifactVersion.sourceKind, 'GENERATED');
});

void test('[IAE-024] missing or mismatched transfer receipt and output policy fail closed', async () => {
  const cases = [
    [
      subject({
        capability: (() => {
          const { transferReceipt: _receipt, ...withoutReceipt } = capability();
          void _receipt;
          return withoutReceipt;
        })(),
      }),
      command(),
      'TRANSFER_RECEIPT_MISSING',
    ],
    [subject(), command({ contentSha256: 'b'.repeat(64) }), 'TRANSFER_RECEIPT_MISMATCH'],
    [subject(), command({ contentLength: 129 }), 'OUTPUT_POLICY_MISMATCH'],
    [subject(), command({ mediaType: 'text/csv' }), 'OUTPUT_POLICY_MISMATCH'],
  ] as const;
  for (const [fixture, input, code] of cases)
    assert.deepEqual(await fixture.service.finalize(identity(), input), { accepted: false, code });
});

void test('[IAE-024] superseded, expired and epoch-revoked attempts fail closed', async () => {
  const revoked = capability({ revokedAt: timestamp('2026-08-13T00:01:30.000Z') });
  const expired = capability({ expiresAt: timestamp('2026-08-13T00:01:30.000Z') });
  assert.deepEqual(await subject({ capability: revoked }).service.finalize(identity(), command()), {
    accepted: false,
    code: 'ATTEMPT_SUPERSEDED',
  });
  assert.deepEqual(await subject({ capability: expired }).service.finalize(identity(), command()), {
    accepted: false,
    code: 'CAPABILITY_EXPIRED',
  });
  assert.deepEqual(await subject({ epochCurrent: false }).service.finalize(identity(), command()), {
    accepted: false,
    code: 'SECURITY_EPOCH_REVOKED',
  });
});

void test('[IAE-024] stale signed capability and worker mismatch fail closed', async () => {
  assert.deepEqual(
    await subject({ signatureCurrent: false }).service.finalize(identity(), command()),
    { accepted: false, code: 'SIGNED_CAPABILITY_INVALID' },
  );
  assert.deepEqual(
    await subject({
      capability: capability({ workerId: stable('00000000-0000-4000-8000-000000000a99') }),
    }).service.finalize(identity(), command()),
    { accepted: false, code: 'SECURITY_EPOCH_REVOKED' },
  );
});

void test('[IAE-007/012/024] source lineage mismatch is rejected', async () => {
  const invalid = capability({
    resultFinalizationBinding: {
      ...capability().resultFinalizationBinding!,
      sourceLineageHash: 'c'.repeat(64),
    },
  });
  assert.deepEqual(await subject({ capability: invalid }).service.finalize(identity(), command()), {
    accepted: false,
    code: 'SOURCE_LINEAGE_MISMATCH',
  });
});

void test('[IAE-024] identical submission replays exact attestation and changed reuse conflicts', async () => {
  const fixture = subject();
  const first = await fixture.service.finalize(identity(), command());
  const replay = await fixture.service.finalize(identity(), command());
  const changed = await fixture.service.finalize(
    identity(),
    command({ contentSha256: 'd'.repeat(64) }),
  );

  assert.equal(first.accepted, true);
  assert.deepEqual(replay, first);
  assert.deepEqual(changed, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
});

void test('[IAE-024] uniqueness race rereads exact scoped receipt before replaying', async () => {
  let raced:
    | Parameters<IaeWorkerResultFinalizationTransactionPortV1['saveFinalization']>[0]
    | undefined;
  const repository: IaeWorkerResultFinalizationRepositoryPortV1 = {
    withTransaction: (_scope, work) =>
      work({
        findCapability: async () => capability(),
        findAttestationBySubmission: async () => undefined,
        saveFinalization: async (input) => {
          raced = input;
          throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        },
      }),
    findAttestationBySubmission: async () =>
      raced === undefined
        ? undefined
        : { requestHash: raced.requestHash, attestation: raced.attestation },
  };
  const values = [ids.attestation, ids.lineage];
  const service = new IaeWorkerResultFinalizationService(
    repository,
    { verify: async () => true },
    { isCurrent: async () => true },
    () => values.shift() ?? ids.lineage,
    () => '2026-08-13T00:02:00.000Z',
  );

  const result = await service.finalize(identity(), command());
  assert.equal(result.accepted, true);
  assert.equal(result.accepted && result.value.attestationId, ids.attestation);
});
