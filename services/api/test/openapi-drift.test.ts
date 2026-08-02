import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

import { createApiApplication } from '../src/bootstrap.js';

void test('the checked-in v1 OpenAPI artifact matches a fresh application generation', async () => {
  const artifactPath = path.resolve(process.cwd(), 'openapi', 'v1.json');
  const actual = await readFile(artifactPath, 'utf8').catch(() => undefined);
  assert.ok(actual, 'openapi/v1.json must be checked in');

  const { app, openApi } = await createApiApplication();
  try {
    const prettierConfig = (await resolveConfig(artifactPath)) ?? {};
    assert.equal(
      actual,
      await format(JSON.stringify(openApi), {
        ...prettierConfig,
        filepath: artifactPath,
        parser: 'json',
      }),
    );
  } finally {
    await app.close();
  }
});
