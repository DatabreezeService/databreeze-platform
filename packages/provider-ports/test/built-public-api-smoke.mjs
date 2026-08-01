import assert from 'node:assert/strict';

const ports = await import('../dist/v1.js');

assert.equal(ports.PROVIDER_PORT_SCHEMA_VERSION_V1, 1);
assert.equal(typeof ports.defineProviderDescriptorV1, 'function');
assert.equal(typeof ports.createProviderFailureV1, 'function');
assert.equal(typeof ports.defineSecretReferenceV1, 'function');
assert.equal(typeof ports.defineSecretHandleV1, 'function');
assert.equal(typeof ports.defineObjectStorageMultipartPlanV1, 'function');
assert.equal(typeof ports.defineSubscriptionMigrationManifestV1, 'function');
assert.equal(ports.secretHandleIdV1, undefined);
assert.equal(ports.secretReferenceHandleV1, undefined);
