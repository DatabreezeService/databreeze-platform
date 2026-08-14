import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-storage.adapter.js';
import { S3ArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/s3-artifact-upload-storage.adapter.js';
import { UnavailableArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/unavailable-artifact-upload-storage.adapter.js';
import { ARTIFACT_UPLOAD_STORAGE_PORT } from '../../../src/features/iae/application/artifact-upload-storage.port.js';
import { IaeModule } from '../../../src/features/iae/iae.module.js';

function storageProvider(module: ReturnType<typeof IaeModule.register>): unknown {
  const providers = (module.providers ?? []) as readonly {
    readonly provide?: unknown;
    readonly useValue?: unknown;
  }[];
  return providers.find(({ provide }) => provide === ARTIFACT_UPLOAD_STORAGE_PORT)?.useValue;
}

void test('[IAE-014] production composition fails closed without durable upload storage', () => {
  assert.ok(
    storageProvider(IaeModule.register({ runtimeMode: 'production' })) instanceof
      UnavailableArtifactUploadStorageAdapter,
  );
});

void test('[IAE-014] in-memory upload storage is limited to explicit test or development mode', () => {
  assert.ok(
    storageProvider(IaeModule.register({ runtimeMode: 'test' })) instanceof
      InMemoryArtifactUploadStorageAdapter,
  );
  assert.ok(
    storageProvider(IaeModule.register({ runtimeMode: 'development' })) instanceof
      InMemoryArtifactUploadStorageAdapter,
  );
});

void test('[IAE-014] production accepts an explicitly composed S3 storage port', () => {
  const storage = new S3ArtifactUploadStorageAdapter({
    client: { send: () => Promise.resolve({}) } as never,
    bucket: 'databreeze-production-artifacts',
    kmsKeyId: 'arn:aws:kms:ap-southeast-1:123456789012:key/key-id',
  });
  assert.equal(
    storageProvider(
      IaeModule.register({ runtimeMode: 'production', artifactUploadStorage: storage }),
    ),
    storage,
  );
});
