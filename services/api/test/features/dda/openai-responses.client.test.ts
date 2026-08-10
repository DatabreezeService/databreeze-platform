import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OpenAiProviderError,
  OpenAiResponsesClient,
  type OpenAiResponsesTransport,
} from '../../../src/features/dda/ai/adapter/openai-responses.client.js';

const MODEL = 'gpt-4o-mini-2024-07-18';
const ALLOWED_BASE = 'https://api.openai.com/v1';

function createTransport(
  handler: OpenAiResponsesTransport['create'] = () =>
    Promise.resolve({
      id: 'resp_test',
      model: MODEL,
      status: 'completed',
      output: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
): OpenAiResponsesTransport {
  return { create: handler };
}

void test('[DDA-043] shared client refuses missing or blank credentials', () => {
  assert.throws(
    () =>
      new OpenAiResponsesClient({
        apiKey: '',
        model: MODEL,
        baseUrl: ALLOWED_BASE,
        transport: createTransport(),
      }),
    (error: unknown) => error instanceof OpenAiProviderError && error.code === 'OPENAI_CREDENTIAL',
  );
  assert.throws(
    () =>
      new OpenAiResponsesClient({
        apiKey: '   ',
        model: MODEL,
        baseUrl: ALLOWED_BASE,
        transport: createTransport(),
      }),
    (error: unknown) => error instanceof OpenAiProviderError && error.code === 'OPENAI_CREDENTIAL',
  );
});

void test('[DDA-043] shared client refuses disallowed base URLs', () => {
  assert.throws(
    () =>
      new OpenAiResponsesClient({
        apiKey: 'test-key',
        model: MODEL,
        baseUrl: 'https://evil.example/v1',
        transport: createTransport(),
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
});

void test('[DDA-044] shared client requires explicit pinned model configuration', () => {
  assert.throws(
    () =>
      new OpenAiResponsesClient({
        apiKey: 'test-key',
        model: '',
        baseUrl: ALLOWED_BASE,
        transport: createTransport(),
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
});

void test('[DDA-043] shared client refuses unsafe store/background/tool settings', async () => {
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key',
    model: MODEL,
    baseUrl: ALLOWED_BASE,
    transport: createTransport(),
  });
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '00000000-0000-4000-8000-000000000041',
        timeoutMs: 1_000,
        store: true,
        tools: [],
        input: [],
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '00000000-0000-4000-8000-000000000041',
        timeoutMs: 1_000,
        store: false,
        background: true,
        tools: [],
        input: [],
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '00000000-0000-4000-8000-000000000041',
        timeoutMs: 1_000,
        store: false,
        tools: [{ type: 'web_search' }],
        input: [],
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
});

void test('[DDA-045] shared client requires timeout and correlation id', async () => {
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key',
    model: MODEL,
    baseUrl: ALLOWED_BASE,
    transport: createTransport(),
  });
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '',
        timeoutMs: 1_000,
        store: false,
        tools: [],
        input: [],
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '00000000-0000-4000-8000-000000000041',
        timeoutMs: 0,
        store: false,
        tools: [],
        input: [],
      }),
    (error: unknown) =>
      error instanceof OpenAiProviderError && error.code === 'OPENAI_UNSAFE_CONFIGURATION',
  );
});

void test('[DDA-045] shared client returns content-safe metadata only', async () => {
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key',
    model: MODEL,
    baseUrl: ALLOWED_BASE,
    transport: createTransport(() =>
      Promise.resolve({
        id: 'resp_123',
        model: MODEL,
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'SECRET_OCR' }] }],
        usage: { input_tokens: 11, output_tokens: 7 },
      }),
    ),
    nowMs: () => 1_000,
  });
  const result = await client.createResponse({
    correlationId: '00000000-0000-4000-8000-000000000041',
    timeoutMs: 1_000,
    store: false,
    tools: [],
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'synthetic' }] }],
    adapterVersion: 'openai-receipt-ocr-1',
    promptVersion: 'receipt-vi-en-v1',
    schemaVersion: 'dda-receipt-candidate.v1',
    preprocessingVersion: 'receipt-image-v1',
  });
  assert.equal(result.metadata.providerRequestId, 'resp_123');
  assert.equal(result.metadata.returnedModelId, MODEL);
  assert.equal(result.metadata.inputTokens, 11);
  assert.equal(result.metadata.outputTokens, 7);
  assert.equal(result.metadata.outcomeCode, 'SUCCEEDED');
  assert.equal(result.metadata.retryCount, 0);
  assert.doesNotMatch(JSON.stringify(result.metadata), /SECRET_OCR|test-key|Bearer|synthetic/u);
});

void test('[DDA-043] shared client normalizes rate-limit failures', async () => {
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key',
    model: MODEL,
    baseUrl: ALLOWED_BASE,
    transport: createTransport(() => {
      const error = new Error('rate limited') as Error & { status?: number };
      error.status = 429;
      return Promise.reject(error);
    }),
  });
  await assert.rejects(
    () =>
      client.createResponse({
        correlationId: '00000000-0000-4000-8000-000000000041',
        timeoutMs: 1_000,
        store: false,
        tools: [],
        input: [],
      }),
    (error: unknown) => error instanceof OpenAiProviderError && error.code === 'OPENAI_RATE_LIMIT',
  );
});
