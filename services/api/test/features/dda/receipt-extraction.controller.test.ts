import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaBuaPortV1,
  DdaIaePortV1,
} from '../../../src/features/dda/application/foundation-ports.js';
import { DefaultReceiptAiPolicyAdapter } from '../../../src/features/dda/receipt/application/default-receipt-ai-policy.adapter.js';
import { DeterministicFakeReceiptOcrAdapter } from '../../../src/features/dda/receipt/application/deterministic-fake-receipt-ocr.adapter.js';
import { ReceiptExtractionController } from '../../../src/features/dda/receipt/api/receipt-extraction.controller.js';
import { ReceiptExtractionService } from '../../../src/features/dda/receipt/application/receipt-extraction.service.js';

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
    ),
  );
  const response = await controller.extract({
    tenantScope: scope,
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    profileVersionId: '00000000-0000-4000-8000-000000000011',
    profileKind: 'receipt',
    correlationId: '00000000-0000-4000-8000-000000000041',
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body['code'], 'WRONG_SCOPE_ARTIFACT');
  void PNG_HASH;
});
