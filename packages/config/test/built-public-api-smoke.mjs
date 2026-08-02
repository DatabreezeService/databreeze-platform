import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
const typesTarget = manifest.exports['./runtime/v1'].types;

assert.equal(typesTarget, './dist/runtime-config/v1.d.ts');
assert.equal(existsSync(path.resolve(packageDirectory, typesTarget)), true);

const runtime = await import('../dist/runtime-config/v1.js');

assert.equal(runtime.RUNTIME_CONFIG_SCHEMA_VERSION_V1, 1);
assert.equal(typeof runtime.loadRuntimeConfigV1, 'function');
assert.equal(runtime.secretReferenceHandleV1, undefined);
assert.equal(runtime.createSecretReferenceV1, undefined);
