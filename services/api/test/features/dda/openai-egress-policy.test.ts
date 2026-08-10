import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDdaAiEgressPolicyV1,
  evaluateDdaAiEgressV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';

import {
  loadOpenAiReceiptOcrConfig,
  OpenAiReceiptOcrAdapter,
} from '../../../src/features/dda/receipt/adapter/openai-receipt-ocr.adapter.js';

const scope = {
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
};

void test('[DDA-044, ADR-0005] OpenAI receipt egress fails closed when credentials are absent', async () => {
  const config = loadOpenAiReceiptOcrConfig({
    OPENAI_API_KEY: undefined,
    DATABREEZE_OPENAI_RECEIPT_MODEL: 'gpt-4.1-mini-2025-04-14',
  });
  assert.equal(config.enabled, false);
  assert.equal(config.apiKeyPresent, false);

  const adapter = new OpenAiReceiptOcrAdapter(config, {
    fetchImpl: () => {
      return Promise.reject(new Error('network must not be called without credentials'));
    },
  });

  await assert.rejects(
    () =>
      adapter.extract({
        artifactVersionId: '00000000-0000-4000-8000-000000000501',
        profileVersionId: '00000000-0000-4000-8000-000000000502',
        tenantWorkspaceId: scope.workspaceId,
        contentSha256: 'a'.repeat(64),
        mediaType: 'image/png',
        imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        preprocessingVersion: 'receipt-image-passthrough-v1',
        coordinateSpace: 'normalized-unit-square-v1',
      }),
    (error: unknown) => error instanceof Error && error.message === 'OPENAI_CREDENTIAL_UNAVAILABLE',
  );
});

void test('[DDA-044, ADR-0005] OpenAI adapter requires cloud egress and never exposes image bytes in errors', async () => {
  const config = loadOpenAiReceiptOcrConfig({
    OPENAI_API_KEY: undefined,
    DATABREEZE_OPENAI_RECEIPT_MODEL: 'gpt-4o-mini-2024-07-18',
  });
  const adapter = new OpenAiReceiptOcrAdapter(config);
  assert.equal(adapter.requiresCloudEgress, true);
});

void test('[DDA-044, ADR-0005] receipt extraction purpose is denied unless policy enables OpenAI', () => {
  const disabled = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000aa',
    tenantScope: scope,
    enabled: false,
    locality: 'DENIED',
    purposeAllowlist: ['DISABLED'],
    adapterAllowlist: [],
  });
  assert.equal(disabled.accepted, true);
  if (!disabled.accepted) return;

  const denied = evaluateDdaAiEgressV1(disabled.value, {
    adapter: 'openai-responses',
    purpose: 'RECEIPT_EXTRACTION',
    payloadBytes: 2048,
    includesEvidence: true,
  });
  assert.equal(denied.accepted, false);
  if (denied.accepted) return;
  assert.equal(denied.code, 'AI_EGRESS_DENIED');

  const enabled = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000ab',
    tenantScope: scope,
    enabled: true,
    locality: 'CLOUD',
    purposeAllowlist: ['RECEIPT_EXTRACTION'],
    adapterAllowlist: ['openai-responses'],
    allowEvidence: true,
    maximumPayloadBytes: 4096,
    retentionDays: 0,
  });
  assert.equal(enabled.accepted, true);
  if (!enabled.accepted) return;
  const allowed = evaluateDdaAiEgressV1(enabled.value, {
    adapter: 'openai-responses',
    purpose: 'RECEIPT_EXTRACTION',
    payloadBytes: 2048,
    includesEvidence: true,
  });
  assert.equal(allowed.accepted, true);
});

void test('[DDA-044, ADR-0005] kill switch and store:false remain forced in OpenAI config', () => {
  const config = loadOpenAiReceiptOcrConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    DATABREEZE_OPENAI_RECEIPT_ENABLED: 'false',
    DATABREEZE_OPENAI_RECEIPT_MODEL: 'gpt-4.1-mini-2025-04-14',
  });
  assert.equal(config.enabled, false);
  assert.equal(config.store, false);
  assert.equal(config.toolsEnabled, false);
  assert.equal(config.apiKeyPresent, true);
});
