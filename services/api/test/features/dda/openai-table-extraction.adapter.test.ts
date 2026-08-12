import assert from 'node:assert/strict';
import test from 'node:test';

import { DisabledOpenAiTableExtractionAdapter } from '../../../src/features/dda/table-extraction/adapter/openai-table-extraction.adapter.js';
import { OPENAI_TABLE_OUTPUT_SCHEMA_V1 } from '../../../src/features/dda/table-extraction/adapter/openai-table-output.schema.js';

void test('[DDA-057] OpenAI table adapter remains disabled without owner live gate', async () => {
  const adapter = new DisabledOpenAiTableExtractionAdapter();
  const result = await adapter.extract({
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    widthPx: 100,
    heightPx: 100,
    pageCount: 1,
  });
  assert.deepEqual(result, { accepted: false, code: 'PROVIDER_DISABLED' });
  assert.equal(OPENAI_TABLE_OUTPUT_SCHEMA_V1.properties.profileVersion.const, 'TABLE_V1');
  assert.equal(OPENAI_TABLE_OUTPUT_SCHEMA_V1.additionalProperties, false);
});
