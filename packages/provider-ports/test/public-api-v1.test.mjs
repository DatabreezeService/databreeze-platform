import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('publishes versioned provider boundaries', async () => {
  let ports;
  try {
    ports = await import('../src/v1.ts');
  } catch {
    ports = undefined;
  }

  assert.ok(ports, 'the provider v1 source entry point must exist');
  assert.equal(ports.PROVIDER_PORT_SCHEMA_VERSION_V1, 1);
  assert.equal(typeof ports.defineProviderDescriptorV1, 'function');
});

test('exposes only the versioned provider entry point', async () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.exports), ['./v1']);
  await assert.rejects(import('@databreeze/provider-ports'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
});
