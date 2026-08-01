import assert from 'node:assert/strict';

const ports = await import('../dist/v1.js');

assert.equal(ports.PROVIDER_PORT_SCHEMA_VERSION_V1, 1);
assert.equal(typeof ports.defineProviderDescriptorV1, 'function');
assert.equal(typeof ports.createProviderFailureV1, 'function');
assert.equal(typeof ports.defineSecretHandleV1, 'function');
