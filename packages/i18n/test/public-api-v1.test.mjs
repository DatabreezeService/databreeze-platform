import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadSourceApi() {
  try {
    return await import('../src/v1.ts');
  } catch {
    return undefined;
  }
}

test('publishes the versioned bilingual foundation API', async () => {
  const api = await loadSourceApi();

  assert.ok(api, 'the i18n v1 source entry point must exist');
  assert.equal(api.I18N_SCHEMA_VERSION_V1, 1);
  assert.equal(api.DEFAULT_LOCALE_V1, 'vi-VN');
  assert.deepEqual(api.SUPPORTED_LOCALES_V1, ['vi-VN', 'en']);
  assert.equal(typeof api.negotiateLocaleV1, 'function');
  assert.equal(typeof api.formatMessageV1, 'function');
  assert.equal(typeof api.formatRetryAfterSecondsV1, 'function');
  assert.equal(typeof api.formatDateTimeV1, 'function');
  assert.equal(typeof api.formatDecimalV1, 'function');
  assert.equal(typeof api.formatCurrencyV1, 'function');
  assert.equal(typeof api.formatPercentV1, 'function');
  assert.equal(typeof api.formatListV1, 'function');
  assert.equal(typeof api.formatRelativeTimeV1, 'function');
  assert.equal(typeof api.selectPluralCategoryV1, 'function');
});

test('exposes only the versioned entry point', async () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));

  assert.deepEqual(Object.keys(manifest.exports), ['./v1']);
  await assert.rejects(import('@databreeze/i18n'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
