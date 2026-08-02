import {
  ProviderContractErrorV1,
  assertMutatingProviderRequestV1,
  assertObjectStorageCompleteMultipartRequestV1,
  createProviderFailureV1,
  defineObjectStorageExitManifestV1,
  defineObjectStorageMultipartUploadV1,
  defineObjectStorageUploadedPartV1,
  defineProviderDescriptorV1,
  defineProviderHealthV1,
} from '../../src/v1.ts';
import type {
  ObjectStorageBeginMultipartResultV1,
  ObjectStorageMultipartPlanV1,
  ObjectStorageMultipartUploadV1,
  ObjectStorageProviderPortV1,
  ObjectStoragePutResultV1,
  ObjectStorageUploadedPartV1,
  ProviderOperationV1,
} from '../../src/v1.ts';

type BackingKindV1 = 'map' | 'record';

interface BackingV1<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): boolean;
}

interface IdempotencyRecordV1<T> {
  readonly fingerprint: string;
  readonly result: T;
}

function replayV1<T>(
  backing: BackingV1<IdempotencyRecordV1<T>>,
  key: string,
  fingerprint: string,
  operation: ProviderOperationV1,
): T | undefined {
  const prior = backing.get(key);
  if (prior === undefined) return undefined;
  if (prior.fingerprint !== fingerprint) {
    throw createProviderFailureV1({
      code: 'CONFLICT',
      operation,
      retryable: false,
    });
  }
  return prior.result;
}

function createBackingV1<T>(kind: BackingKindV1): BackingV1<T> {
  if (kind === 'map') {
    const values = new Map<string, T>();
    return {
      get: (key) => values.get(key),
      set: (key, value) => {
        values.set(key, value);
      },
      delete: (key) => values.delete(key),
    };
  }
  const values = Object.create(null) as Record<string, T | undefined>;
  return {
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
    },
    delete: (key) => {
      if (!Object.hasOwn(values, key)) return false;
      return delete values[key];
    },
  };
}

function descriptorV1(adapterKey: string) {
  return defineProviderDescriptorV1({
    kind: 'object-storage',
    adapterKey,
    capabilities: (
      [
        'begin-multipart-upload',
        'upload-part',
        'complete-multipart-upload',
        'abort-multipart-upload',
        'read-range',
        'verify-digest',
        'apply-retention',
        'delete-verified',
        'create-read-grant',
        'export-object-manifest',
      ] as const
    ).map((operation) => ({
      operation,
      idempotency: 'required',
      cancellation: 'cooperative',
      timeoutMs: 5_000,
      maxAttempts: 3,
    })),
    dataHandling: {
      regions: ['local'],
      contentRetention: 'durable',
      maximumRetentionSeconds: 86_400,
      trainingUse: 'not_applicable',
    },
    resilience: { failover: 'manual', degradedBehavior: 'fail_closed' },
    exit: {
      statePortability: 'full',
      exportFormat: 'databreeze-object-storage-exit-v1',
      credentialRevocation: 'not_applicable',
    },
  });
}

export function storageFakeV1(
  adapterKey: string,
  backingKind: BackingKindV1,
  sha256V1: (content: Uint8Array) => string,
): ObjectStorageProviderPortV1 {
  const beginReceipts =
    createBackingV1<IdempotencyRecordV1<ObjectStorageBeginMultipartResultV1>>(backingKind);
  const partReceipts =
    createBackingV1<IdempotencyRecordV1<ObjectStorageUploadedPartV1>>(backingKind);
  const parts = createBackingV1<Uint8Array>(backingKind);
  const results = createBackingV1<IdempotencyRecordV1<ObjectStoragePutResultV1>>(backingKind);
  const objects = createBackingV1<Uint8Array>(backingKind);
  const objectIds = new WeakMap<object, number>();
  let nextObjectId = 1;
  let nextUploadRef = 1;

  const objectId = (value: object): number => {
    const existing = objectIds.get(value);
    if (existing !== undefined) return existing;
    const assigned = nextObjectId;
    nextObjectId += 1;
    objectIds.set(value, assigned);
    return assigned;
  };
  const planFingerprint = (plan: ObjectStorageMultipartPlanV1): readonly unknown[] => [
    objectId(plan),
    plan.objectKey,
    plan.expectedSha256,
    plan.expectedByteLength,
    plan.partSizeBytes,
    plan.maximumParts,
  ];
  const uploadFingerprint = (upload: ObjectStorageMultipartUploadV1): readonly unknown[] => [
    objectId(upload),
    ...planFingerprint(upload.plan),
  ];

  return {
    descriptor: () => descriptorV1(adapterKey),
    async checkHealth() {
      await Promise.resolve();
      return defineProviderHealthV1({
        status: 'healthy',
        checkedAt: '2026-08-01T10:00:00.000Z',
        latencyMs: 0,
        safeReasonCodes: [],
      });
    },
    async beginMultipartUpload(request) {
      const key = assertMutatingProviderRequestV1(request.context);
      const fingerprint = JSON.stringify(['begin', ...planFingerprint(request.plan)]);
      const prior = replayV1(beginReceipts, key, fingerprint, 'begin-multipart-upload');
      if (prior !== undefined) return prior;
      const upload = defineObjectStorageMultipartUploadV1({
        uploadRef: `upload:${nextUploadRef}`,
        plan: request.plan,
      });
      nextUploadRef += 1;
      beginReceipts.set(key, Object.freeze({ fingerprint, result: upload }));
      await Promise.resolve();
      return upload;
    },
    async uploadPart(request) {
      const key = assertMutatingProviderRequestV1(request.context);
      const fingerprint = JSON.stringify([
        'upload',
        ...uploadFingerprint(request.upload),
        objectId(request.part),
        request.part.partNumber,
        request.part.sha256,
        request.part.byteLength,
      ]);
      const prior = replayV1(partReceipts, key, fingerprint, 'upload-part');
      if (prior !== undefined) return prior;
      const content = request.part.readContent();
      if (sha256V1(content) !== request.part.sha256) throw new ProviderContractErrorV1();
      const receipt = defineObjectStorageUploadedPartV1({
        upload: request.upload,
        part: request.part,
        receiptRef: `part:${request.part.partNumber}`,
      });
      parts.set(`${request.upload.uploadRef}:${request.part.partNumber}`, content);
      partReceipts.set(key, Object.freeze({ fingerprint, result: receipt }));
      await Promise.resolve();
      return receipt;
    },
    async completeMultipartUpload(untrustedRequest) {
      const request = assertObjectStorageCompleteMultipartRequestV1(untrustedRequest);
      const key = assertMutatingProviderRequestV1(request.context);
      const fingerprint = JSON.stringify([
        'complete',
        ...uploadFingerprint(request.upload),
        request.expectedSha256,
        request.expectedByteLength,
        request.orderedParts.map((receipt) => [
          objectId(receipt),
          receipt.partNumber,
          receipt.sha256,
          receipt.byteLength,
          receipt.receiptRef,
        ]),
      ]);
      const prior = replayV1(results, key, fingerprint, 'complete-multipart-upload');
      if (prior !== undefined) return prior;
      const chunks: Uint8Array[] = [];
      let byteLength = 0;
      for (const receipt of request.orderedParts) {
        const content = parts.get(`${request.upload.uploadRef}:${receipt.partNumber}`);
        if (content === undefined || sha256V1(content) !== receipt.sha256) {
          throw new ProviderContractErrorV1();
        }
        chunks.push(content);
        byteLength += content.byteLength;
      }
      const content = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const sha256 = sha256V1(content);
      if (byteLength !== request.expectedByteLength || sha256 !== request.expectedSha256) {
        throw new ProviderContractErrorV1();
      }
      const objectRef = `object:${request.upload.plan.objectKey}`;
      objects.set(objectRef, content);
      const result = Object.freeze({ objectRef, sha256, byteLength });
      results.set(key, Object.freeze({ fingerprint, result }));
      await Promise.resolve();
      return result;
    },
    async abortMultipartUpload(request) {
      assertMutatingProviderRequestV1(request.context);
      await Promise.resolve();
      return Object.freeze({ aborted: true });
    },
    async readRange(request) {
      await Promise.resolve();
      return (
        objects.get(request.objectRef)?.slice(request.offset, request.offset + request.length) ??
        new Uint8Array()
      );
    },
    async verifyDigest(request) {
      const content = objects.get(request.objectRef);
      await Promise.resolve();
      return Object.freeze({
        verified: content !== undefined && sha256V1(content) === request.expectedSha256,
      });
    },
    async applyRetention(request) {
      assertMutatingProviderRequestV1(request.context);
      await Promise.resolve();
      return Object.freeze({ applied: true });
    },
    async deleteVerified(request) {
      assertMutatingProviderRequestV1(request.context);
      await Promise.resolve();
      return Object.freeze({ deleted: objects.delete(request.objectRef) });
    },
    async createReadGrant(request) {
      assertMutatingProviderRequestV1(request.context);
      await Promise.resolve();
      return Object.freeze({
        grantRef: `grant:${request.objectRef}`,
        expiresAt: request.expiresAt,
      });
    },
    async exportObjectManifest() {
      await Promise.resolve();
      return defineObjectStorageExitManifestV1({
        manifestFormat: 'databreeze-object-storage-exit-v1',
        entries: [],
        complete: true,
      });
    },
  };
}
