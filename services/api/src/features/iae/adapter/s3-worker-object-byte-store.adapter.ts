import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerObjectByteStorePortV1,
  IaeWorkerObjectStoreResultV1,
  IaeWorkerStoredObjectV1,
} from '../application/worker-object-transfer.port.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const OBJECT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;

export interface S3WorkerObjectByteStoreOptionsV1 {
  readonly client: S3Client;
  readonly bucket: string;
  readonly kmsKeyId: string;
  readonly keyPrefix?: string;
}

function rejected(
  code: Exclude<IaeWorkerObjectStoreResultV1, { readonly accepted: true }>['code'],
): IaeWorkerObjectStoreResultV1 {
  return Object.freeze({ accepted: false, code });
}

function safeObjectId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    OBJECT.test(value) &&
    !value.includes('..') &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

function key(prefix: string, scope: TenantScopeV1, objectId: string): string {
  const scopeHash = createHash('sha256').update(tenantScopeKeyV1(scope), 'utf8').digest('hex');
  const objectHash = createHash('sha256').update(objectId, 'utf8').digest('hex');
  return `${prefix}/worker-results/quarantine/${scopeHash}/${objectHash}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readBounded(body: unknown, maximum: number): Promise<Uint8Array | undefined> {
  if (!(typeof body === 'object' && body !== null && Symbol.asyncIterator in body))
    return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : undefined;
    if (bytes === undefined) return undefined;
    length += bytes.byteLength;
    if (length > maximum) return undefined;
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks, length));
}

function missing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? error.name : undefined;
  return name === 'NoSuchKey' || name === 'NotFound';
}

function exists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? error.name : undefined;
  const status =
    '$metadata' in error && typeof error.$metadata === 'object' && error.$metadata !== null
      ? (error.$metadata as { readonly httpStatusCode?: unknown }).httpStatusCode
      : undefined;
  return name === 'PreconditionFailed' || status === 412;
}

/**
 * IAE-024: private, exact-scope, create-only S3 storage for non-authoritative worker outputs.
 * Logical object IDs are hashed into quarantine keys and this adapter deliberately has no list,
 * URL, prefix, delete, copy, or credential surface.
 */
export class S3WorkerObjectByteStoreAdapter implements IaeWorkerObjectByteStorePortV1 {
  private readonly prefix: string;

  public constructor(private readonly options: S3WorkerObjectByteStoreOptionsV1) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(options.bucket))
      throw new Error('IAE_WORKER_S3_BUCKET_INVALID');
    if (!options.kmsKeyId || options.kmsKeyId.length > 2048)
      throw new Error('IAE_WORKER_S3_KMS_KEY_INVALID');
    this.prefix = options.keyPrefix ?? 'iae-v1';
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u.test(this.prefix))
      throw new Error('IAE_WORKER_S3_PREFIX_INVALID');
  }

  public async readExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1> {
    if (
      !safeObjectId(input.objectId) ||
      !Number.isSafeInteger(input.maximumByteLength) ||
      input.maximumByteLength < 0
    )
      return rejected('STORE_UNAVAILABLE');
    try {
      const response = await this.options.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key(this.prefix, input.tenantScope, input.objectId),
        }),
      );
      if (response.ContentLength !== undefined && response.ContentLength > input.maximumByteLength)
        return rejected('OBJECT_OVERSIZE');
      const bytes = await readBounded(response.Body, input.maximumByteLength);
      if (bytes === undefined) return rejected('OBJECT_OVERSIZE');
      const contentSha256 = sha256(bytes);
      const declared = response.Metadata?.['content-sha256'];
      if (declared !== undefined && declared !== contentSha256)
        return rejected('STORE_UNAVAILABLE');
      const value: IaeWorkerStoredObjectV1 = Object.freeze({
        objectId: input.objectId,
        bytes,
        contentSha256,
        contentLength: bytes.byteLength,
      });
      return Object.freeze({ accepted: true, value });
    } catch (error) {
      return missing(error) ? rejected('OBJECT_NOT_FOUND') : rejected('STORE_UNAVAILABLE');
    }
  }

  public async writeExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly bytes: Uint8Array;
    readonly contentSha256: string;
    readonly contentLength: number;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1> {
    if (
      !safeObjectId(input.objectId) ||
      !(input.bytes instanceof Uint8Array) ||
      !SHA256.test(input.contentSha256) ||
      !Number.isSafeInteger(input.contentLength) ||
      input.contentLength < 0 ||
      input.bytes.byteLength !== input.contentLength ||
      sha256(input.bytes) !== input.contentSha256
    )
      return rejected('STORE_UNAVAILABLE');
    if (
      !Number.isSafeInteger(input.maximumByteLength) ||
      input.maximumByteLength < 0 ||
      input.contentLength > input.maximumByteLength
    )
      return rejected('OBJECT_OVERSIZE');
    try {
      await this.options.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key(this.prefix, input.tenantScope, input.objectId),
          Body: input.bytes,
          ContentLength: input.contentLength,
          ContentType: 'application/octet-stream',
          ChecksumSHA256: Buffer.from(input.contentSha256, 'hex').toString('base64'),
          Metadata: { 'content-sha256': input.contentSha256 },
          IfNoneMatch: '*',
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: this.options.kmsKeyId,
        }),
      );
    } catch (error) {
      if (!exists(error)) return rejected('STORE_UNAVAILABLE');
      const current = await this.readExact({
        tenantScope: input.tenantScope,
        objectId: input.objectId,
        maximumByteLength: input.maximumByteLength,
      });
      if (!current.accepted) return rejected('OBJECT_IMMUTABLE');
      if (
        current.value.contentLength !== input.contentLength ||
        current.value.contentSha256 !== input.contentSha256
      )
        return rejected('OBJECT_IMMUTABLE');
      return current;
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        objectId: input.objectId,
        bytes: new Uint8Array(input.bytes),
        contentSha256: input.contentSha256,
        contentLength: input.contentLength,
      }),
    });
  }
}

export function createS3WorkerObjectByteStoreAdapterV1(input: {
  readonly bucket: string;
  readonly region: string;
  readonly kmsKeyId: string;
  readonly keyPrefix?: string;
}): S3WorkerObjectByteStoreAdapter {
  return new S3WorkerObjectByteStoreAdapter({
    client: new S3Client({ region: input.region }),
    bucket: input.bucket,
    kmsKeyId: input.kmsKeyId,
    ...(input.keyPrefix === undefined ? {} : { keyPrefix: input.keyPrefix }),
  });
}
