import assert from 'node:assert/strict';

const runtime = await import('../dist/runtime-config/v1.js');

assert.equal(runtime.RUNTIME_CONFIG_SCHEMA_VERSION_V1, 1);
assert.equal(typeof runtime.loadRuntimeConfigV1, 'function');
assert.equal(runtime.secretReferenceHandleV1, undefined);
assert.equal(runtime.createSecretReferenceV1, undefined);
