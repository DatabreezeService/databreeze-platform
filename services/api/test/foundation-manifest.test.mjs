import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const manifestUrl = new URL('../package.json', import.meta.url);

test('the API workspace exposes independently runnable quality and artifact gates', async () => {
  const manifestSource = await readFile(manifestUrl, 'utf8').catch(() => undefined);
  assert.ok(manifestSource, 'services/api/package.json must exist');
  const manifest = JSON.parse(manifestSource);

  assert.equal(manifest.name, '@databreeze/api');
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, 'module');
  for (const script of [
    'build',
    'lint',
    'openapi:check',
    'openapi:generate',
    'prisma:generate',
    'prisma:validate',
    'test',
    'typecheck',
  ]) {
    assert.equal(typeof manifest.scripts[script], 'string', `missing ${script} script`);
  }
});
