import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA,
  OPENAI_RECEIPT_SCHEMA_NAME,
  openaiReceiptTextFormatV1,
} from '../../../src/features/dda/receipt/adapter/openai-receipt-output.schema.js';
import { OPENAI_RECEIPT_PROMPT_VERSION } from '../../../src/features/dda/receipt/adapter/openai-receipt-prompt.js';
import { OPENAI_RECEIPT_PINNED_MODEL } from '../../../src/features/dda/receipt/adapter/openai-receipt-ocr.config.js';

void test('[DDA-041, DDA-042] receipt OpenAI contract freezes schema name, strictness, and pinned model', () => {
  const format = openaiReceiptTextFormatV1();
  assert.equal(format.format.type, 'json_schema');
  assert.equal(format.format.name, OPENAI_RECEIPT_SCHEMA_NAME);
  assert.equal(format.format.strict, true);
  assert.equal(format.format.schema.additionalProperties, false);
  assert.ok(format.format.schema.required.includes('merchant'));
  assert.ok(format.format.schema.required.includes('total'));
  assert.equal(OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA.properties.lineItems.maxItems, 40);
  assert.equal(OPENAI_RECEIPT_PROMPT_VERSION, 'receipt-vi-en-v1');
  assert.equal(OPENAI_RECEIPT_PINNED_MODEL, 'gpt-4o-mini-2024-07-18');
});
