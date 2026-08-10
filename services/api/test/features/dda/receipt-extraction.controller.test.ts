import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { DeterministicFakeReceiptOcrAdapter } from '../../../src/features/dda/receipt/application/deterministic-fake-receipt-ocr.adapter.js';
import { ReceiptExtractionController } from '../../../src/features/dda/receipt/api/receipt-extraction.controller.js';
import { ReceiptExtractionService } from '../../../src/features/dda/receipt/application/receipt-extraction.service.js';
import type { DdaIaePortV1 } from '../../../src/features/dda/application/foundation-ports.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

void test('[DDA-041] controller maps extraction denials to stable problem codes', async () => {
  const iae: DdaIaePortV1 = {
    async requireArtifactVersion() {
      throw new Error('IAE_WRONG_SCOPE');
    },
    async requireEvidenceReference() {
      return undefined;
    },
    async addRetentionConstraint() {
      return undefined;
    },
  };
  const controller = new ReceiptExtractionController(
    new ReceiptExtractionService(new DeterministicFakeReceiptOcrAdapter(), iae, {
      async emitContentSafeSummary() {
        return undefined;
      },
    }),
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
});
