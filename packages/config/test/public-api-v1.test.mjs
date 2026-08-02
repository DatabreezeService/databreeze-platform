import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('publishes a versioned runtime configuration loader', async () => {
  let runtime;
  try {
    runtime = await import('../src/runtime-config/v1.ts');
  } catch {
    runtime = undefined;
  }

  assert.ok(runtime, 'the runtime/v1 source entry point must exist');
  assert.equal(runtime.RUNTIME_CONFIG_SCHEMA_VERSION_V1, 1);
  assert.equal(typeof runtime.loadRuntimeConfigV1, 'function');
});

test('exposes only the versioned runtime entry point', async () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.exports), ['./runtime/v1']);
  await assert.rejects(import('@databreeze/config'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
