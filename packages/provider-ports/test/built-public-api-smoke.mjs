import assert from 'node:assert/strict';

const ports = await import('../dist/v1.js');

assert.equal(ports.PROVIDER_PORT_SCHEMA_VERSION_V1, 1);
assert.equal(typeof ports.defineProviderDescriptorV1, 'function');
assert.equal(typeof ports.createProviderFailureV1, 'function');
assert.equal(typeof ports.createSecretReferenceCapabilityV1, 'function');
assert.equal(typeof ports.isSecretReferenceCapabilityV1, 'function');
assert.equal(typeof ports.isSecretReferenceIssuerV1, 'function');
assert.equal(typeof ports.isSecretReferenceV1, 'function');
assert.equal(typeof ports.isSecretReferenceForCapabilityV1, 'function');
assert.equal(typeof ports.assertSecretReferenceCapabilityV1, 'function');
assert.equal(typeof ports.assertSecretReferenceIssuerV1, 'function');
assert.equal(typeof ports.assertSecretReferenceV1, 'function');
assert.equal(typeof ports.assertSecretReferenceForCapabilityV1, 'function');
assert.equal(ports.defineSecretReferenceV1, undefined);
assert.equal(typeof ports.defineSecretHandleV1, 'function');
assert.equal(typeof ports.defineObjectStorageMultipartPlanV1, 'function');
assert.equal(typeof ports.defineObjectStorageMultipartUploadV1, 'function');
assert.equal(typeof ports.defineObjectStorageUploadPartRequestV1, 'function');
assert.equal(typeof ports.defineObjectStorageUploadedPartV1, 'function');
assert.equal(typeof ports.defineObjectStorageCompleteMultipartRequestV1, 'function');
assert.equal(typeof ports.defineSubscriptionMigrationManifestV1, 'function');
assert.equal(ports.secretHandleIdV1, undefined);
assert.equal(ports.secretReferenceHandleV1, undefined);
