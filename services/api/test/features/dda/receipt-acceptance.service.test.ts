import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaAudComposePortV1,
  DdaDsmPortV1,
  DdaIaePortV1,
} from '../../../src/features/dda/application/foundation-ports.js';
import { ReceiptAcceptanceService } from '../../../src/features/dda/receipt/application/receipt-acceptance.service.js';
import { ReceiptValidationService } from '../../../src/features/dda/receipt/application/receipt-validation.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

void test('[DDA-042] acceptance is idempotent and emits DSM only after validation', async () => {
  const datasetVersions: string[] = [];
  const audits: string[] = [];
  const dsm: DdaDsmPortV1 = {
    requireDatasetVersion() {
      return Promise.resolve(undefined);
    },
    requireSemanticVersion() {
      return Promise.resolve(undefined);
    },
    requireMetricVersion() {
      return Promise.resolve(undefined);
    },
  };
  const iae: DdaIaePortV1 = {
    requireArtifactVersion() {
      return Promise.resolve(undefined);
    },
    requireEvidenceReference() {
      return Promise.resolve(undefined);
    },
    addRetentionConstraint() {
      return Promise.resolve(undefined);
    },
  };
  const aud: DdaAudComposePortV1 = {
    emitContentSafeSummary(input) {
      audits.push(input.action);
    },
  };
  const service = new ReceiptAcceptanceService(new ReceiptValidationService(), dsm, iae, aud, {
    appendGovernedRecord(input) {
      datasetVersions.push(input.datasetVersionId);
      return Promise.resolve({ datasetVersionId: input.datasetVersionId });
    },
  });

  const payload = {
    tenantScope: scope,
    candidateId: '00000000-0000-4000-8000-00000000002a',
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    artifactContentHash: 'd'.repeat(64),
    expectedRevision: 1,
    correlationId: '00000000-0000-4000-8000-000000000041',
    idempotencyKey: 'accept-1',
    record: {
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '100000',
      tax: '20000',
      total: '120000',
      fieldConfidence: { merchant: 90, total: 95, currency: 97, subtotal: 88, tax: 90 },
    },
  };

  assert.equal(service.hasDatasetVersion(payload.candidateId), false);
  const first = await service.accept(payload);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(datasetVersions.length, 1);
  assert.equal(service.hasDatasetVersion(payload.candidateId), true);

  const replay = await service.accept(payload);
  assert.equal(replay.accepted, true);
  if (!replay.accepted) return;
  assert.equal(replay.value.replayed, true);
  assert.equal(datasetVersions.length, 1);
  assert.ok(audits.includes('RECEIPT_ACCEPTANCE'));
});

void test('[DDA-042] expected-revision conflict user correction path and DSM failure block acceptance', async () => {
  const failingDsm: DdaDsmPortV1 = {
    requireDatasetVersion() {
      return Promise.reject(new Error('DSM_FAILURE'));
    },
    requireSemanticVersion() {
      return Promise.resolve(undefined);
    },
    requireMetricVersion() {
      return Promise.resolve(undefined);
    },
  };
  const iae: DdaIaePortV1 = {
    requireArtifactVersion() {
      return Promise.resolve(undefined);
    },
    requireEvidenceReference() {
      return Promise.resolve(undefined);
    },
    addRetentionConstraint() {
      return Promise.resolve(undefined);
    },
  };
  const aud: DdaAudComposePortV1 = {
    emitContentSafeSummary() {
      return Promise.resolve(undefined);
    },
  };
  const service = new ReceiptAcceptanceService(
    new ReceiptValidationService({ lowConfidenceThreshold: 85 }),
    failingDsm,
    iae,
    aud,
    {
      appendGovernedRecord(input) {
        return Promise.resolve({ datasetVersionId: input.datasetVersionId });
      },
    },
  );

  const conflict = await service.accept({
    tenantScope: scope,
    candidateId: '00000000-0000-4000-8000-00000000002b',
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    artifactContentHash: 'e'.repeat(64),
    expectedRevision: 1,
    currentRevision: 2,
    correlationId: '00000000-0000-4000-8000-000000000041',
    record: {
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '100000',
      tax: '20000',
      total: '120000',
      fieldConfidence: { merchant: 90, total: 95, currency: 97, subtotal: 88, tax: 90 },
    },
  });
  assert.equal(conflict.accepted, false);
  if (conflict.accepted) return;
  assert.equal(conflict.code, 'EXPECTED_REVISION_CONFLICT');

  const low = await service.accept({
    tenantScope: scope,
    candidateId: '00000000-0000-4000-8000-00000000002c',
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    artifactContentHash: 'f'.repeat(64),
    expectedRevision: 1,
    correlationId: '00000000-0000-4000-8000-000000000041',
    record: {
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '100000',
      tax: '20000',
      total: '120000',
      fieldConfidence: { merchant: 90, total: 40 },
    },
  });
  assert.equal(low.accepted, false);
  if (low.accepted) return;
  assert.equal(low.code, 'LOW_CONFIDENCE_REVIEW');
  assert.equal(service.hasDatasetVersion('00000000-0000-4000-8000-00000000002c'), false);

  const dsmFail = await service.accept({
    tenantScope: scope,
    candidateId: '00000000-0000-4000-8000-00000000002d',
    artifactVersionId: '00000000-0000-4000-8000-000000000023',
    artifactContentHash: '1'.repeat(64),
    expectedRevision: 1,
    correlationId: '00000000-0000-4000-8000-000000000041',
    record: {
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '100000',
      tax: '20000',
      total: '120000',
      fieldConfidence: { merchant: 90, total: 95, currency: 97, subtotal: 88, tax: 90 },
    },
  });
  assert.equal(dsmFail.accepted, false);
  if (dsmFail.accepted) return;
  assert.equal(dsmFail.code, 'DSM_FAILURE');
});
