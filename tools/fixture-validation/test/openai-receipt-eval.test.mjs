import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runOpenAiReceiptEval } from '../src/run-openai-receipt-eval.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/dda/receipt-expense/openai-eval');

void test('[DDA-041, DDA-042] offline receipt eval scores synthetic corpus without network', async () => {
  const report = await runOpenAiReceiptEval(['--offline']);
  assert.equal(report.mode, 'offline');
  assert.equal(report.offlineVerified, true);
  assert.equal(report.liveEvaluation, 'blocked-owner-run');
  assert.equal(report.productionReady, false);
  assert.equal(report.aggregate.percentageCorrect, 'not-evaluated');
  assert.equal(report.aggregate.caseCount, 3);
  assert.ok(report.aggregate.refusalCount >= 1);
  assert.ok(report.aggregate.schemaFailureCount >= 1);

  const vi = report.caseScores.find((row) => row.caseId === 'synthetic-vi');
  assert.ok(vi);
  assert.equal(vi.arithmeticReconciliation, 'pass');
  assert.equal(vi.coordinateValidity, 'pass');
  assert.equal(vi.perField.merchant.normalizedMatch, true);
  assert.equal(vi.percentageCorrect, 'not-evaluated');
});

void test('[DDA-041] offline eval fails when fixture hash changes', async () => {
  const manifestPath = join(FIXTURE_DIR, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const mutated = JSON.parse(original);
  mutated.cases[0].contentSha256 = '0'.repeat(64);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(manifestPath, `${JSON.stringify(mutated, null, 2)}\n`);
  try {
    await assert.rejects(() => runOpenAiReceiptEval(['--offline']), /hash mismatch/u);
  } finally {
    writeFileSync(manifestPath, original);
  }
});

void test('[DDA-044] live mode fails closed before network when gates are missing', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      () =>
        runOpenAiReceiptEval([
          '--live',
          '--acknowledge-external-egress',
          '--corpus',
          'synthetic',
          '--max-requests',
          '1',
          '--max-input-bytes',
          '3000000',
        ]),
      /OPENAI_API_KEY/u,
    );
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

void test('[DDA-043] recorded responses and expected fixtures contain no secret-shaped literals', () => {
  const recorded = readFileSync(join(FIXTURE_DIR, 'recorded-provider-responses.json'), 'utf8');
  const manifest = readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8');
  assert.doesNotMatch(recorded, /sk-[a-zA-Z0-9]{20,}/u);
  assert.doesNotMatch(manifest, /sk-[a-zA-Z0-9]{20,}/u);
  assert.match(manifest, /noCustomerData/u);
});

function collectObjectSchemas(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      collectObjectSchemas(item, `${path}[${index}]`, out);
    }
    return;
  }
  if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))) {
    out.push({ path, schema: node });
  }
  if (node.properties) {
    for (const [key, value] of Object.entries(node.properties)) {
      collectObjectSchemas(value, `${path}.properties.${key}`, out);
    }
  }
  if (node.items) collectObjectSchemas(node.items, `${path}.items`, out);
  if (node.anyOf) collectObjectSchemas(node.anyOf, `${path}.anyOf`, out);
  if (node.oneOf) collectObjectSchemas(node.oneOf, `${path}.oneOf`, out);
}

void test('[DDA-041, DDA-042] live request uses canonical strict schema without contacting OpenAI', async () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DATABREEZE_OPENAI_RECEIPT_MODEL: process.env.DATABREEZE_OPENAI_RECEIPT_MODEL,
    DATABREEZE_OPENAI_IMAGE_DETAIL: process.env.DATABREEZE_OPENAI_IMAGE_DETAIL,
    fetch: globalThis.fetch,
  };
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key-aaaaaaaaaaaaaaaa';
  process.env.DATABREEZE_OPENAI_RECEIPT_MODEL = 'gpt-4o-mini-2024-07-18';
  process.env.DATABREEZE_OPENAI_IMAGE_DETAIL = 'high';

  let capturedBody;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: 'resp_mock',
          model: process.env.DATABREEZE_OPENAI_RECEIPT_MODEL,
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    merchant: {
                      sourceValue: 'Cafe',
                      normalizedValue: 'Cafe',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
                    },
                    transactionDate: {
                      sourceValue: '2024-01-01',
                      normalizedValue: '2024-01-01',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
                    },
                    transactionTime: null,
                    currency: {
                      sourceValue: 'VND',
                      normalizedValue: 'VND',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.3, width: 0.1, height: 0.05 },
                    },
                    subtotal: {
                      sourceValue: '100',
                      normalizedValue: '100',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.4, width: 0.1, height: 0.05 },
                    },
                    tax: {
                      sourceValue: '10',
                      normalizedValue: '10',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.5, width: 0.1, height: 0.05 },
                    },
                    total: {
                      sourceValue: '110',
                      normalizedValue: '110',
                      confidence: 0.9,
                      confidenceBasis: 'unknown',
                      evidenceCoordinates: { page: 1, x: 0.1, y: 0.6, width: 0.1, height: 0.05 },
                    },
                    paymentMethod: null,
                    paymentReference: null,
                    lineItems: [],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
  };

  try {
    const report = await runOpenAiReceiptEval([
      '--live',
      '--acknowledge-external-egress',
      '--corpus',
      'synthetic',
      '--max-requests',
      '1',
      '--max-input-bytes',
      '3000000',
    ]);
    assert.equal(report.mode, 'live');
    assert.equal(report.productionReady, false);
    assert.ok(capturedBody);
    assert.equal(capturedBody.text.format.type, 'json_schema');
    assert.equal(capturedBody.text.format.name, 'dda_receipt_candidate_v1');
    assert.equal(capturedBody.text.format.strict, true);

    const objectSchemas = [];
    collectObjectSchemas(capturedBody.text.format.schema, 'schema', objectSchemas);
    assert.ok(objectSchemas.length >= 3);
    for (const { path, schema } of objectSchemas) {
      assert.equal(schema.additionalProperties, false, `${path} must set additionalProperties:false`);
      assert.equal(typeof schema.properties, 'object', `${path} must declare properties`);
      assert.ok(Array.isArray(schema.required), `${path} must declare required`);
      assert.deepEqual(
        [...schema.required].sort(),
        Object.keys(schema.properties).sort(),
        `${path} required must match properties`,
      );
    }

    const { OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA, OPENAI_RECEIPT_SCHEMA_NAME } = await import(
      '@databreeze/domain/dda-receipt-openai/v1'
    );
    assert.equal(capturedBody.text.format.name, OPENAI_RECEIPT_SCHEMA_NAME);
    assert.deepEqual(capturedBody.text.format.schema, OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA);
  } finally {
    if (previous.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
    if (previous.DATABREEZE_OPENAI_RECEIPT_MODEL === undefined) {
      delete process.env.DATABREEZE_OPENAI_RECEIPT_MODEL;
    } else {
      process.env.DATABREEZE_OPENAI_RECEIPT_MODEL = previous.DATABREEZE_OPENAI_RECEIPT_MODEL;
    }
    if (previous.DATABREEZE_OPENAI_IMAGE_DETAIL === undefined) {
      delete process.env.DATABREEZE_OPENAI_IMAGE_DETAIL;
    } else {
      process.env.DATABREEZE_OPENAI_IMAGE_DETAIL = previous.DATABREEZE_OPENAI_IMAGE_DETAIL;
    }
    globalThis.fetch = previous.fetch;
  }
});

void test('[DDA-043] live HTTP 400 diagnostics stay sanitized', async () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DATABREEZE_OPENAI_RECEIPT_MODEL: process.env.DATABREEZE_OPENAI_RECEIPT_MODEL,
    DATABREEZE_OPENAI_IMAGE_DETAIL: process.env.DATABREEZE_OPENAI_IMAGE_DETAIL,
    fetch: globalThis.fetch,
  };
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key-bbbbbbbbbbbbbbbb';
  process.env.DATABREEZE_OPENAI_RECEIPT_MODEL = 'gpt-4o-mini-2024-07-18';
  process.env.DATABREEZE_OPENAI_IMAGE_DETAIL = 'high';

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return {
        error: {
          type: 'invalid_request_error',
          code: 'invalid_json_schema',
          message: 'Invalid schema for response_format',
          param: 'text.format.schema',
        },
        leakedAuthorization: 'Bearer sk-test-not-a-real-key-bbbbbbbbbbbbbbbb',
        image_url: 'data:image/png;base64,AAAA',
      };
    },
  });

  try {
    await assert.rejects(
      () =>
        runOpenAiReceiptEval([
          '--live',
          '--acknowledge-external-egress',
          '--corpus',
          'synthetic',
          '--max-requests',
          '1',
          '--max-input-bytes',
          '3000000',
        ]),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /provider HTTP 400/u);
        assert.match(message, /invalid_request_error/u);
        assert.match(message, /invalid_json_schema/u);
        assert.match(message, /Invalid schema for response_format/u);
        assert.doesNotMatch(message, /Bearer\s/u);
        assert.doesNotMatch(message, /sk-test-not-a-real-key/u);
        assert.doesNotMatch(message, /data:image/u);
        assert.doesNotMatch(message, /leakedAuthorization/u);
        assert.doesNotMatch(message, /image_url/u);
        return true;
      },
    );
  } finally {
    if (previous.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
    if (previous.DATABREEZE_OPENAI_RECEIPT_MODEL === undefined) {
      delete process.env.DATABREEZE_OPENAI_RECEIPT_MODEL;
    } else {
      process.env.DATABREEZE_OPENAI_RECEIPT_MODEL = previous.DATABREEZE_OPENAI_RECEIPT_MODEL;
    }
    if (previous.DATABREEZE_OPENAI_IMAGE_DETAIL === undefined) {
      delete process.env.DATABREEZE_OPENAI_IMAGE_DETAIL;
    } else {
      process.env.DATABREEZE_OPENAI_IMAGE_DETAIL = previous.DATABREEZE_OPENAI_IMAGE_DETAIL;
    }
    globalThis.fetch = previous.fetch;
  }
});
