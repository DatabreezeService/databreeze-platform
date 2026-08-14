import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaBuaPortV1,
  DdaIaePortV1,
} from '../../../src/features/dda/application/foundation-ports.js';
import { InMemoryReceiptExtractionCommandRepositoryAdapter } from '../../../src/features/dda/receipt/application/in-memory-receipt-extraction-command-repository.adapter.js';
import { DefaultReceiptAiPolicyAdapter } from '../../../src/features/dda/receipt/application/default-receipt-ai-policy.adapter.js';
import { DeterministicFakeReceiptOcrAdapter } from '../../../src/features/dda/receipt/application/deterministic-fake-receipt-ocr.adapter.js';
import { ReceiptExtractionController } from '../../../src/features/dda/receipt/api/receipt-extraction.controller.js';
import { ReceiptExtractionService } from '../../../src/features/dda/receipt/application/receipt-extraction.service.js';
import type { ReceiptExtractionCommandRepositoryPortV1 } from '../../../src/features/dda/receipt/application/receipt-extraction-command.port.js';
import type { ReceiptMutationAuthorizationPortV1 } from '../../../src/features/dda/receipt/application/receipt-mutation-authorization.port.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_HASH = createHash('sha256').update(PNG_BYTES).digest('hex');

void test('[DDA-041] controller maps extraction denials to stable problem codes', async () => {
  const iae: DdaIaePortV1 = {
    requireArtifactVersion() {
      return Promise.reject(new Error('IAE_WRONG_SCOPE'));
    },
    requireEvidenceReference() {
      return Promise.resolve(undefined);
    },
    addRetentionConstraint() {
      return Promise.resolve(undefined);
    },
    openProcessingContent() {
      return Promise.resolve({
        accepted: false as const,
        code: 'PROCESSING_CONTENT_SCOPE_DENIED' as const,
      });
    },
  };
  const bua: DdaBuaPortV1 = {
    requireAdmission() {
      return Promise.resolve();
    },
    reserveCapacity(input) {
      return Promise.resolve({
        reservationId: randomUUID(),
        usageClass: input.usageClass,
      });
    },
    finalizeReservation() {
      return Promise.resolve();
    },
  };
  const controller = new ReceiptExtractionController(
    new ReceiptExtractionService(
      new DeterministicFakeReceiptOcrAdapter(),
      iae,
      {
        emitContentSafeSummary() {
          return Promise.resolve(undefined);
        },
      },
      new DefaultReceiptAiPolicyAdapter(),
      bua,
      {
        commands: new InMemoryReceiptExtractionCommandRepositoryAdapter(),
        authorization: {
          authorize() {
            return Promise.resolve({ accepted: true as const });
          },
        } as ReceiptMutationAuthorizationPortV1,
      },
    ),
    {
      resolve: () =>
        Promise.resolve({
          tenantScope: scope,
          actorId: '00000000-0000-4000-8000-000000000004' as never,
          correlationId: '00000000-0000-4000-8000-000000000005' as never,
          idempotencyKey: 'receipt-controller-test',
          authorizationEpoch: 1,
          mfaReenrollmentRequired: false,
        }),
    },
  );
  await assert.rejects(
    controller.extract(
      { headers: { authorization: 'Bearer verified-request' } },
      {
        artifactVersionId: '00000000-0000-4000-8000-000000000023',
        profileVersionId: '00000000-0000-4000-8000-000000000011',
        profileKind: 'receipt',
        correlationId: '00000000-0000-4000-8000-000000000041',
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 404,
  );
  void PNG_HASH;
});

void test('[IAM-019] controller maps receipt authority decisions to safe HTTP statuses', async () => {
  const body = {
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    profileVersionId: '00000000-0000-4000-8000-000000000011',
    profileKind: 'receipt',
    correlationId: '00000000-0000-4000-8000-000000000041',
  };
  const request = { headers: { authorization: 'Bearer verified-request' } };
  const requestContext = {
    resolve: () =>
      Promise.resolve({
        tenantScope: scope,
        actorId: '00000000-0000-4000-8000-000000000004' as never,
        correlationId: '00000000-0000-4000-8000-000000000005' as never,
        idempotencyKey: 'receipt-authority-test',
        authorizationEpoch: 1,
        mfaReenrollmentRequired: false,
      }),
  };
  for (const [code, status] of [
    ['AUTHORIZATION_DENIED', 403],
    ['AUTHORIZATION_UNAVAILABLE', 503],
    ['COMMAND_CONFLICT', 409],
  ] as const) {
    const controller = new ReceiptExtractionController(
      {
        extract: () => Promise.resolve({ accepted: false as const, code }),
      } as unknown as ReceiptExtractionService,
      requestContext,
    );
    await assert.rejects(
      controller.extract(request, body),
      (error: unknown) =>
        error instanceof Error &&
        'getStatus' in error &&
        (error as { getStatus(): number }).getStatus() === status,
    );
  }
});

void test('[DDA-041][IAM-019] candidate read is exact-resource scoped and server authorized', async () => {
  const candidate = Object.freeze({
    schemaVersion: 1 as const,
    candidateId: '00000000-0000-4000-8000-000000000051',
    tenantScope: scope,
    artifactVersionId: '00000000-0000-4000-8000-000000000052',
    profileVersionId: '00000000-0000-4000-8000-000000000053',
    fieldCandidates: Object.freeze([
      Object.freeze({ field: 'merchant', value: 'Synthetic Cafe', confidence: 72 }),
    ]),
    adapterVersion: 'synthetic-adapter-v1',
    modelVersion: 'synthetic-model-v1',
    evidenceReferenceId: '00000000-0000-4000-8000-000000000054',
    candidateHash: 'a'.repeat(64),
    treatedAsUntrustedData: true as const,
  });
  const repository = {
    findCandidate(input) {
      return Promise.resolve(
        input.candidateId === candidate.candidateId &&
          input.artifactVersionId === candidate.artifactVersionId
          ? candidate
          : undefined,
      );
    },
  } as ReceiptExtractionCommandRepositoryPortV1;
  const authorization: ReceiptMutationAuthorizationPortV1 = {
    authorize(input) {
      return Promise.resolve(
        input.action === 'RECEIPT_CORRECT' &&
          input.candidateId === candidate.candidateId &&
          input.artifactVersionId === candidate.artifactVersionId
          ? { accepted: true as const }
          : { accepted: false as const, code: 'FORBIDDEN' as const },
      );
    },
  };
  const controller = new ReceiptExtractionController(
    {} as ReceiptExtractionService,
    {
      resolve: () =>
        Promise.resolve({
          tenantScope: scope,
          actorId: '00000000-0000-4000-8000-000000000004' as never,
          correlationId: '00000000-0000-4000-8000-000000000005' as never,
          idempotencyKey: 'receipt-candidate-read',
          authorizationEpoch: 1,
          mfaReenrollmentRequired: false,
        }),
    },
    repository,
    authorization,
  );

  const response = await controller.readCandidate(
    { headers: { authorization: 'Bearer verified-request' } },
    candidate.candidateId,
    { artifactVersionId: candidate.artifactVersionId },
  );
  assert.equal(response['candidateId'], candidate.candidateId);
  assert.equal(response['artifactVersionId'], candidate.artifactVersionId);

  await assert.rejects(
    controller.readCandidate(
      { headers: { authorization: 'Bearer verified-request' } },
      candidate.candidateId,
      { artifactVersionId: '00000000-0000-4000-8000-000000000099' },
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 403,
  );
});
