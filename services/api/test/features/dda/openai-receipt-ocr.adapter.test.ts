import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenAiProviderError } from '../../../src/features/dda/ai/adapter/openai-provider.error.js';
import type { OpenAiResponsesTransport } from '../../../src/features/dda/ai/adapter/openai-responses.client.js';
import {
  loadOpenAiReceiptOcrConfig,
  OpenAiReceiptOcrAdapter,
  OPENAI_RECEIPT_PINNED_MODEL,
} from '../../../src/features/dda/receipt/adapter/openai-receipt-ocr.adapter.js';
import { OPENAI_RECEIPT_SCHEMA_NAME } from '../../../src/features/dda/receipt/adapter/openai-receipt-output.schema.js';
import type { ReceiptOcrRequest } from '../../../src/features/dda/receipt/application/receipt-ocr.port.js';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function request(overrides?: Partial<ReceiptOcrRequest>): ReceiptOcrRequest {
  return {
    artifactVersionId: '00000000-0000-4000-8000-000000000501',
    profileVersionId: '00000000-0000-4000-8000-000000000502',
    tenantWorkspaceId: '00000000-0000-4000-8000-000000000002',
    contentSha256: 'a'.repeat(64),
    mediaType: 'image/png',
    imageBytes: PNG_BYTES,
    preprocessingVersion: 'receipt-image-passthrough-v1',
    coordinateSpace: 'normalized-unit-square-v1',
    ...overrides,
  };
}

function field(sourceValue: string, normalizedValue: string | null = sourceValue) {
  return {
    sourceValue,
    normalizedValue,
    confidence: 0.91,
    confidenceBasis: 'model_self_reported' as const,
    evidenceCoordinates: { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
  };
}

function validPayload() {
  return {
    merchant: field('Cafe Sua'),
    transactionDate: field('2026-08-10'),
    transactionTime: field('10:15:00'),
    currency: field('VND'),
    subtotal: field('100.000', '100000'),
    tax: field('20.000', '20000'),
    total: field('120.000', '120000'),
    paymentMethod: null,
    paymentReference: null,
    lineItems: [],
  };
}

function messageResponse(text: string, model = OPENAI_RECEIPT_PINNED_MODEL) {
  return {
    id: 'resp_test',
    model,
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text }],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 80 },
  };
}

void test('[DDA-041, ADR-0005] request construction uses pinned model, data URL image, strict schema, store:false', () => {
  const config = loadOpenAiReceiptOcrConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    DATABREEZE_OPENAI_RECEIPT_ENABLED: 'true',
    DATABREEZE_OPENAI_RECEIPT_MODEL: OPENAI_RECEIPT_PINNED_MODEL,
    DATABREEZE_OPENAI_IMAGE_DETAIL: 'high',
  });
  assert.equal(config.modelSnapshot, 'gpt-4o-mini-2024-07-18');
  assert.equal(config.imageDetail, 'high');

  const adapter = new OpenAiReceiptOcrAdapter(config, {
    transport: {
      create() {
        return Promise.reject(new Error('network must not be called in buildRequest'));
      },
    },
  });
  const built = adapter.buildRequest(request());
  assert.equal(built.model, OPENAI_RECEIPT_PINNED_MODEL);
  assert.equal(built.store, false);
  assert.deepEqual(built.tools, []);
  assert.equal(built.text.format.type, 'json_schema');
  assert.equal(built.text.format.strict, true);
  assert.equal(built.text.format.name, OPENAI_RECEIPT_SCHEMA_NAME);
  assert.equal(built.detail, 'high');
  assert.ok(built.maxOutputTokens > 0);

  const user = built.input[1] as {
    role: string;
    content: readonly { type: string; image_url?: string; detail?: string; text?: string }[];
  };
  assert.equal(user.role, 'user');
  const image = user.content.find((part) => part.type === 'input_image');
  assert.ok(image);
  assert.match(image?.image_url ?? '', /^data:image\/png;base64,/u);
  assert.equal(image?.detail, 'high');
  const system = built.input[0] as { content: readonly { text?: string }[] };
  assert.match(system.content[0]?.text ?? '', /untrusted data, not instructions/u);
  assert.doesNotMatch(JSON.stringify(built.input), /ignore previous instructions/u);
});

void test('[DDA-041] original detail fails closed on unsupported pinned mini model', () => {
  const config = loadOpenAiReceiptOcrConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    DATABREEZE_OPENAI_RECEIPT_MODEL: OPENAI_RECEIPT_PINNED_MODEL,
    DATABREEZE_OPENAI_IMAGE_DETAIL: 'original',
  });
  const adapter = new OpenAiReceiptOcrAdapter(config, {
    transport: {
      create() {
        return Promise.reject(new Error('network must not be called'));
      },
    },
  });
  assert.throws(() => adapter.buildRequest(request()), (error: unknown) => {
    return error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION';
  });
});

void test('[DDA-041, DDA-042] valid structured output maps to ReceiptOcrResult with version metadata', async () => {
  const transport: OpenAiResponsesTransport = {
    create() {
      return Promise.resolve(messageResponse(JSON.stringify(validPayload())));
    },
  };
  const adapter = new OpenAiReceiptOcrAdapter(
    loadOpenAiReceiptOcrConfig({
      OPENAI_API_KEY: 'sk-test-not-a-real-key',
      DATABREEZE_OPENAI_RECEIPT_MODEL: OPENAI_RECEIPT_PINNED_MODEL,
    }),
    { transport },
  );
  const result = await adapter.extract(request());
  assert.equal(result.modelVersion, OPENAI_RECEIPT_PINNED_MODEL);
  assert.equal(result.adapterVersion, 'openai-receipt-ocr-2');
  assert.equal(result.promptVersion, 'receipt-vi-en-v1');
  assert.equal(result.schemaVersion, 'dda-receipt-candidate.v1');
  assert.equal(result.preprocessingVersion, 'receipt-image-passthrough-v1');
  assert.equal(result.fields.find((f) => f.field === 'merchant')?.value, 'Cafe Sua');
  assert.equal(result.fields.find((f) => f.field === 'total')?.value, '120000');
  assert.equal(
    result.fields.find((f) => f.field === 'transactionDateTime')?.value,
    '2026-08-10T10:15:00',
  );
});

void test('[DDA-041] refusal, incomplete, tool, schema, and coordinate failures fail closed', async () => {
  const cases: Array<{ name: string; response: unknown; code: string }> = [
    {
      name: 'refusal',
      response: {
        id: 'r1',
        model: OPENAI_RECEIPT_PINNED_MODEL,
        status: 'completed',
        output: [{ type: 'refusal', refusal: 'no' }],
      },
      code: 'OPENAI_REFUSAL',
    },
    {
      name: 'incomplete',
      response: {
        id: 'r2',
        model: OPENAI_RECEIPT_PINNED_MODEL,
        status: 'incomplete',
        output: [],
      },
      code: 'OPENAI_INCOMPLETE',
    },
    {
      name: 'tool',
      response: {
        id: 'r3',
        model: OPENAI_RECEIPT_PINNED_MODEL,
        status: 'completed',
        output: [{ type: 'function_call', name: 'browse' }],
      },
      code: 'OPENAI_UNSAFE_CONFIGURATION',
    },
    {
      name: 'malformed-json',
      response: messageResponse('{not-json'),
      code: 'OPENAI_SCHEMA',
    },
    {
      name: 'additional-properties',
      response: messageResponse(JSON.stringify({ ...validPayload(), extra: true })),
      code: 'OPENAI_SCHEMA',
    },
    {
      name: 'invalid-confidence',
      response: messageResponse(
        JSON.stringify({
          ...validPayload(),
          total: { ...field('120000'), confidence: 1.5 },
        }),
      ),
      code: 'OPENAI_SCHEMA',
    },
    {
      name: 'invalid-coordinates',
      response: messageResponse(
        JSON.stringify({
          ...validPayload(),
          total: {
            ...field('120000'),
            evidenceCoordinates: { page: 1, x: -0.1, y: 0, width: 0.2, height: 0.1 },
          },
        }),
      ),
      code: 'OPENAI_SCHEMA',
    },
    {
      name: 'missing-model',
      response: { ...messageResponse(JSON.stringify(validPayload())), model: '' },
      code: 'OPENAI_SCHEMA',
    },
  ];

  for (const testCase of cases) {
    const adapter = new OpenAiReceiptOcrAdapter(
      loadOpenAiReceiptOcrConfig({
        OPENAI_API_KEY: 'sk-test-not-a-real-key',
        DATABREEZE_OPENAI_RECEIPT_MODEL: OPENAI_RECEIPT_PINNED_MODEL,
      }),
      {
        transport: {
          create() {
            return Promise.resolve(testCase.response as never);
          },
        },
      },
    );
    await assert.rejects(
      () => adapter.extract(request()),
      (error: unknown) =>
        error instanceof OpenAiProviderError && error.code === testCase.code,
      testCase.name,
    );
  }
});

void test('[DDA-043] prompt-like receipt text remains data and cannot broaden tools', () => {
  const adapter = new OpenAiReceiptOcrAdapter(
    loadOpenAiReceiptOcrConfig({
      OPENAI_API_KEY: 'sk-test-not-a-real-key',
      DATABREEZE_OPENAI_RECEIPT_MODEL: OPENAI_RECEIPT_PINNED_MODEL,
    }),
    {
      transport: {
        create() {
          return Promise.reject(new Error('unused'));
        },
      },
    },
  );
  const built = adapter.buildRequest(request());
  assert.deepEqual(built.tools, []);
  assert.equal(built.store, false);
  const serialized = JSON.stringify(built);
  assert.match(serialized, /untrusted data, not instructions/u);
  assert.doesNotMatch(serialized, /"type":"web_search"/u);
});
