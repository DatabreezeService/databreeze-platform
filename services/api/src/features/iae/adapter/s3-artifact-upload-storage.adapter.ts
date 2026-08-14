import { createHash, randomUUID } from 'node:crypto';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
  type Part,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ArtifactUploadPartV1,
  ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactUploadPartTransferV1,
  ArtifactUploadStoragePortV1,
  ArtifactUploadStorageResultV1,
  ArtifactUploadVerifiedStorageV1,
} from '../application/artifact-upload-storage.port.js';

const MAX_TRANSFER_SECONDS_V1 = 300;
const CONTROL_SCHEMA_VERSION_V1 = 1;
const MIN_PART_BYTES_V1 = 8 * 1024 * 1024;
const MAX_PART_BYTES_V1 = 64 * 1024 * 1024;
const MAX_OBJECT_BYTES_V1 = 20 * 1024 * 1024 * 1024;

export interface S3ArtifactUploadStorageOptionsV1 {
  readonly client: S3Client;
  readonly bucket: string;
  readonly kmsKeyId: string;
  readonly keyPrefix?: string;
  readonly clock?: () => Date;
  readonly ids?: { next(): string };
  readonly presign?: (
    client: S3Client,
    command: UploadPartCommand,
    options: { readonly expiresIn: number },
  ) => Promise<string>;
}

interface S3UploadControlV1 {
  readonly schemaVersion: typeof CONTROL_SCHEMA_VERSION_V1;
  readonly sessionId: string;
  readonly scopeDigest: string;
  readonly uploadId: string;
  readonly objectKey: string;
  readonly expectedSha256: string;
  readonly expectedByteSize: number;
  readonly mediaType: string;
  readonly expiresAt: string;
}

interface S3TransferControlV1 {
  readonly schemaVersion: typeof CONTROL_SCHEMA_VERSION_V1;
  readonly transferId: string;
  readonly sessionId: string;
  readonly scopeDigest: string;
  readonly partNumber: number;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly expiresAt: string;
}

function accepted<TValue>(value: TValue): ArtifactUploadStorageResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected<TValue>(
  code: Exclude<ArtifactUploadStorageResultV1<TValue>, { readonly accepted: true }>['code'],
): ArtifactUploadStorageResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function safeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u.test(value) && !value.includes('..');
}

function scopeDigest(session: ArtifactUploadSessionV1): string {
  return createHash('sha256').update(JSON.stringify(session.tenantScope), 'utf8').digest('hex');
}

function objectKey(prefix: string, session: ArtifactUploadSessionV1): string {
  return `${prefix}/quarantine/${scopeDigest(session)}/${session.artifactId}/${session.sessionId}`;
}

function publishedObjectKey(prefix: string, session: ArtifactUploadSessionV1): string {
  return `${prefix}/objects/${scopeDigest(session)}/${session.artifactId}/${session.sessionId}`;
}

function uploadControlKey(prefix: string, sessionId: string): string {
  return `${prefix}/control/uploads/${sessionId}.json`;
}

function transferControlKey(prefix: string, transferId: string): string {
  return `${prefix}/control/transfers/${transferId}.json`;
}

function sha256Base64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

function currentPartByteSize(session: ArtifactUploadSessionV1, partNumber: number): number {
  if (partNumber < session.totalParts) return session.partSize;
  return session.expectedByteSize - session.partSize * (session.totalParts - 1);
}

function uploadGeometryAllowed(session: ArtifactUploadSessionV1): boolean {
  return (
    session.expectedByteSize >= 1 &&
    session.expectedByteSize <= MAX_OBJECT_BYTES_V1 &&
    session.partSize >= MIN_PART_BYTES_V1 &&
    session.partSize <= MAX_PART_BYTES_V1
  );
}

function unknownRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function asUploadControl(value: unknown): S3UploadControlV1 | undefined {
  const record = unknownRecord(value);
  if (!record || record['schemaVersion'] !== CONTROL_SCHEMA_VERSION_V1) return undefined;
  const stringKeys = [
    'sessionId',
    'scopeDigest',
    'uploadId',
    'objectKey',
    'expectedSha256',
    'mediaType',
    'expiresAt',
  ] as const;
  if (stringKeys.some((key) => typeof record[key] !== 'string')) return undefined;
  if (
    typeof record['expectedByteSize'] !== 'number' ||
    !Number.isSafeInteger(record['expectedByteSize'])
  )
    return undefined;
  return record as unknown as S3UploadControlV1;
}

function asTransferControl(value: unknown): S3TransferControlV1 | undefined {
  const record = unknownRecord(value);
  if (!record || record['schemaVersion'] !== CONTROL_SCHEMA_VERSION_V1) return undefined;
  const stringKeys = [
    'transferId',
    'sessionId',
    'scopeDigest',
    'contentSha256',
    'expiresAt',
  ] as const;
  if (stringKeys.some((key) => typeof record[key] !== 'string')) return undefined;
  if (
    typeof record['partNumber'] !== 'number' ||
    !Number.isSafeInteger(record['partNumber']) ||
    typeof record['byteSize'] !== 'number' ||
    !Number.isSafeInteger(record['byteSize'])
  )
    return undefined;
  return record as unknown as S3TransferControlV1;
}

async function bodyText(body: unknown): Promise<string | undefined> {
  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToString' in body &&
    typeof body.transformToString === 'function'
  ) {
    return (body.transformToString as () => Promise<string>)();
  }
  return undefined;
}

async function bodySha256(
  body: unknown,
): Promise<{ readonly byteSize: number; readonly sha256: string } | undefined> {
  if (!(typeof body === 'object' && body !== null && Symbol.asyncIterator in body))
    return undefined;
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : undefined;
    if (!bytes) return undefined;
    byteSize += bytes.length;
    hash.update(bytes);
  }
  return Object.freeze({ byteSize, sha256: hash.digest('hex') });
}

/** IAE-002/IAE-014: private immutable multipart objects with durable exact-part grants. */
export class S3ArtifactUploadStorageAdapter implements ArtifactUploadStoragePortV1 {
  private readonly prefix: string;
  private readonly clock: () => Date;
  private readonly presign: NonNullable<S3ArtifactUploadStorageOptionsV1['presign']>;

  public constructor(private readonly options: S3ArtifactUploadStorageOptionsV1) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(options.bucket))
      throw new Error('IAE_S3_BUCKET_INVALID');
    if (!options.kmsKeyId || options.kmsKeyId.length > 2_048)
      throw new Error('IAE_S3_KMS_KEY_INVALID');
    this.prefix = options.keyPrefix ?? 'iae-v1';
    if (!safeSegment(this.prefix)) throw new Error('IAE_S3_PREFIX_INVALID');
    this.clock = options.clock ?? (() => new Date());
    this.presign = options.presign ?? getSignedUrl;
  }

  public async issuePartTransfer(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    input: {
      readonly partNumber: number;
      readonly contentSha256: string;
      readonly byteSize: number;
    },
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadPartTransferV1>> {
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    const now = this.clock();
    if (
      session.state !== 'OPEN' ||
      !uploadGeometryAllowed(session) ||
      !Number.isFinite(now.getTime()) ||
      Date.parse(session.expiresAt) <= now.getTime() ||
      !Number.isSafeInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > session.totalParts ||
      !/^[0-9a-f]{64}$/u.test(input.contentSha256) ||
      input.byteSize !== currentPartByteSize(session, input.partNumber)
    )
      return rejected('UPLOAD_STORAGE_NOT_READY');
    try {
      const control = await this.findOrCreateUploadControl(session);
      if (!control) return rejected('UPLOAD_STORAGE_FINALIZATION_FAILED');
      const expiresAtMilliseconds = Math.min(
        now.getTime() + MAX_TRANSFER_SECONDS_V1 * 1_000,
        Date.parse(session.expiresAt),
      );
      const expiresIn = Math.max(1, Math.floor((expiresAtMilliseconds - now.getTime()) / 1_000));
      const transferId = this.options.ids?.next() ?? randomUUID();
      if (!safeSegment(transferId)) return rejected('UPLOAD_STORAGE_FINALIZATION_FAILED');
      const transfer: S3TransferControlV1 = Object.freeze({
        schemaVersion: CONTROL_SCHEMA_VERSION_V1,
        transferId,
        sessionId: session.sessionId,
        scopeDigest: scopeDigest(session),
        partNumber: input.partNumber,
        contentSha256: input.contentSha256,
        byteSize: input.byteSize,
        expiresAt: new Date(expiresAtMilliseconds).toISOString(),
      });
      await this.putControl(transferControlKey(this.prefix, transferId), transfer);
      const checksum = sha256Base64(input.contentSha256);
      const command = new UploadPartCommand({
        Bucket: this.options.bucket,
        Key: control.objectKey,
        UploadId: control.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.byteSize,
        ChecksumSHA256: checksum,
      });
      const url = await this.presign(this.options.client, command, { expiresIn });
      return accepted(
        Object.freeze({
          transferId,
          sessionId: session.sessionId,
          partNumber: input.partNumber,
          method: 'PUT' as const,
          url,
          requiredHeaders: Object.freeze({
            'content-length': String(input.byteSize),
            'x-amz-checksum-sha256': checksum,
          }),
          expiresAt: transfer.expiresAt as ArtifactUploadSessionV1['expiresAt'],
        }),
      );
    } catch {
      return rejected('UPLOAD_STORAGE_FINALIZATION_FAILED');
    }
  }

  public async verifyPart(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    part: ArtifactUploadPartV1,
    transferId?: string,
  ): Promise<ArtifactUploadStorageResultV1<void>> {
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    if (session.state !== 'OPEN' || !transferId || !safeSegment(transferId))
      return rejected('UPLOAD_STORAGE_TRANSFER_INVALID');
    try {
      const [upload, transfer] = await Promise.all([
        this.readUploadControl(session.sessionId),
        this.readTransferControl(transferId),
      ]);
      if (
        !upload ||
        !transfer ||
        transfer.sessionId !== session.sessionId ||
        transfer.scopeDigest !== scopeDigest(session) ||
        transfer.partNumber !== part.partNumber ||
        transfer.contentSha256 !== part.contentSha256 ||
        transfer.byteSize !== part.byteSize ||
        Date.parse(transfer.expiresAt) <= this.clock().getTime()
      )
        return rejected('UPLOAD_STORAGE_TRANSFER_INVALID');
      const candidates = await this.listAllParts(upload);
      const candidate = candidates.find(({ PartNumber }) => PartNumber === part.partNumber);
      if (
        !candidate ||
        candidate.Size !== part.byteSize ||
        candidate.ChecksumSHA256 !== sha256Base64(part.contentSha256) ||
        !candidate.ETag
      )
        return rejected('UPLOAD_STORAGE_PART_REJECTED');
      return accepted(undefined);
    } catch {
      return rejected('UPLOAD_STORAGE_PART_REJECTED');
    }
  }

  public async finalize(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    assembledSha256: string,
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadVerifiedStorageV1>> {
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    if (
      session.state !== 'FINALIZING' ||
      !uploadGeometryAllowed(session) ||
      session.parts.length !== session.totalParts ||
      assembledSha256 !== session.expectedSha256
    )
      return rejected('UPLOAD_STORAGE_DIGEST_MISMATCH');
    try {
      const upload = await this.readUploadControl(session.sessionId);
      if (!upload) return rejected('UPLOAD_STORAGE_NOT_READY');
      const publishedKey = publishedObjectKey(this.prefix, session);
      const recovered = await this.verifyPublishedObject(session, publishedKey);
      if (recovered) return accepted(recovered);
      const listedParts = await this.listAllParts(upload);
      const completedParts: CompletedPart[] = [];
      for (const part of session.parts) {
        const candidate = listedParts.find(({ PartNumber }) => PartNumber === part.partNumber);
        if (
          !candidate?.ETag ||
          candidate.Size !== part.byteSize ||
          candidate.ChecksumSHA256 !== sha256Base64(part.contentSha256)
        )
          return rejected('UPLOAD_STORAGE_PART_REJECTED');
        completedParts.push({
          PartNumber: part.partNumber,
          ETag: candidate.ETag,
          ChecksumSHA256: candidate.ChecksumSHA256,
        });
      }
      const completed = await this.options.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          UploadId: upload.uploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
      const quarantineVersionId = completed.VersionId;
      const head = await this.options.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          ...(quarantineVersionId ? { VersionId: quarantineVersionId } : {}),
        }),
      );
      const exactQuarantineVersionId = quarantineVersionId ?? head.VersionId;
      if (!exactQuarantineVersionId || head.ContentLength !== session.expectedByteSize) {
        await this.options.client.send(
          new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: upload.objectKey,
            ...(exactQuarantineVersionId ? { VersionId: exactQuarantineVersionId } : {}),
          }),
        );
        return rejected('UPLOAD_STORAGE_DIGEST_MISMATCH');
      }
      const loaded = await this.options.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          VersionId: exactQuarantineVersionId,
        }),
      );
      const digest = await bodySha256(loaded.Body);
      if (
        !digest ||
        digest.byteSize !== session.expectedByteSize ||
        digest.sha256 !== session.expectedSha256
      ) {
        await this.options.client.send(
          new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: upload.objectKey,
            VersionId: exactQuarantineVersionId,
          }),
        );
        return rejected('UPLOAD_STORAGE_DIGEST_MISMATCH');
      }
      const copied = await this.options.client.send(
        new CopyObjectCommand({
          Bucket: this.options.bucket,
          Key: publishedKey,
          CopySource: `${this.options.bucket}/${encodeURIComponent(upload.objectKey).replaceAll('%2F', '/')}?versionId=${encodeURIComponent(exactQuarantineVersionId)}`,
          CopySourceIfMatch: head.ETag,
          MetadataDirective: 'COPY',
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: this.options.kmsKeyId,
        }),
      );
      const publishedVersionId = copied.VersionId;
      if (!publishedVersionId) return rejected('UPLOAD_STORAGE_FINALIZATION_FAILED');
      const published = await this.verifyPublishedObject(session, publishedKey, publishedVersionId);
      if (!published) {
        await this.options.client.send(
          new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: publishedKey,
            VersionId: publishedVersionId,
          }),
        );
        return rejected('UPLOAD_STORAGE_DIGEST_MISMATCH');
      }
      await this.options.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          VersionId: exactQuarantineVersionId,
        }),
      );
      return accepted(published);
    } catch {
      return rejected('UPLOAD_STORAGE_FINALIZATION_FAILED');
    }
  }

  public async abort(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope)) return;
    try {
      const upload = await this.readUploadControl(session.sessionId);
      if (!upload) return;
      await this.options.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          UploadId: upload.uploadId,
        }),
      );
    } catch {
      // Best-effort cleanup; the bucket lifecycle must expire abandoned uploads after 24 hours.
    }
  }

  private async findOrCreateUploadControl(
    session: ArtifactUploadSessionV1,
  ): Promise<S3UploadControlV1 | undefined> {
    const existing = await this.readUploadControl(session.sessionId);
    if (existing) return this.exactUploadControl(existing, session) ? existing : undefined;
    const key = objectKey(this.prefix, session);
    const created = await this.options.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: session.mediaType,
        ChecksumAlgorithm: 'SHA256',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.options.kmsKeyId,
        Metadata: {
          'databreeze-session-id': session.sessionId,
          'databreeze-sha256': session.expectedSha256,
        },
      }),
    );
    if (!created.UploadId) return undefined;
    const control: S3UploadControlV1 = Object.freeze({
      schemaVersion: CONTROL_SCHEMA_VERSION_V1,
      sessionId: session.sessionId,
      scopeDigest: scopeDigest(session),
      uploadId: created.UploadId,
      objectKey: key,
      expectedSha256: session.expectedSha256,
      expectedByteSize: session.expectedByteSize,
      mediaType: session.mediaType,
      expiresAt: session.expiresAt,
    });
    try {
      await this.putControl(uploadControlKey(this.prefix, session.sessionId), control);
      return control;
    } catch {
      await this.options.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.options.bucket,
          Key: key,
          UploadId: created.UploadId,
        }),
      );
      return this.readUploadControl(session.sessionId);
    }
  }

  private async listAllParts(upload: S3UploadControlV1): Promise<readonly Part[]> {
    const parts: Part[] = [];
    let marker: string | undefined;
    do {
      const listed = await this.options.client.send(
        new ListPartsCommand({
          Bucket: this.options.bucket,
          Key: upload.objectKey,
          UploadId: upload.uploadId,
          MaxParts: 1_000,
          ...(marker === undefined ? {} : { PartNumberMarker: marker }),
        }),
      );
      parts.push(...(listed.Parts ?? []));
      if (!listed.IsTruncated) break;
      if (listed.NextPartNumberMarker === undefined)
        throw new Error('IAE_S3_PARTS_CURSOR_MISSING');
      marker = String(listed.NextPartNumberMarker);
    } while (parts.length <= 10_000);
    if (parts.length > 10_000) throw new Error('IAE_S3_PARTS_LIMIT_EXCEEDED');
    return parts;
  }

  private async verifyPublishedObject(
    session: ArtifactUploadSessionV1,
    key: string,
    expectedVersionId?: string,
  ): Promise<ArtifactUploadVerifiedStorageV1 | undefined> {
    try {
      const head = await this.options.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          ...(expectedVersionId ? { VersionId: expectedVersionId } : {}),
        }),
      );
      if (
        !head.VersionId ||
        (expectedVersionId !== undefined && head.VersionId !== expectedVersionId) ||
        head.ContentLength !== session.expectedByteSize ||
        head.Metadata?.['databreeze-session-id'] !== session.sessionId ||
        head.Metadata?.['databreeze-sha256'] !== session.expectedSha256
      )
        return undefined;
      const loaded = await this.options.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          VersionId: head.VersionId,
        }),
      );
      const digest = await bodySha256(loaded.Body);
      if (
        !digest ||
        digest.byteSize !== session.expectedByteSize ||
        digest.sha256 !== session.expectedSha256
      )
        return undefined;
      return Object.freeze({
        opaqueLocator: createHash('sha256')
          .update(`${this.options.bucket}\u0000${key}\u0000${head.VersionId}`, 'utf8')
          .digest('base64url'),
        objectVersionId: head.VersionId,
      });
    } catch (error) {
      const name = unknownRecord(error)?.['name'];
      if (name === 'NoSuchKey' || name === 'NotFound') return undefined;
      throw error;
    }
  }

  private exactUploadControl(
    control: S3UploadControlV1,
    session: ArtifactUploadSessionV1,
  ): boolean {
    return (
      control.sessionId === session.sessionId &&
      control.scopeDigest === scopeDigest(session) &&
      control.objectKey === objectKey(this.prefix, session) &&
      control.expectedSha256 === session.expectedSha256 &&
      control.expectedByteSize === session.expectedByteSize &&
      control.mediaType === session.mediaType &&
      control.expiresAt === session.expiresAt
    );
  }

  private async readUploadControl(sessionId: string): Promise<S3UploadControlV1 | undefined> {
    const value = await this.readControl(uploadControlKey(this.prefix, sessionId));
    return asUploadControl(value);
  }

  private async readTransferControl(transferId: string): Promise<S3TransferControlV1 | undefined> {
    const value = await this.readControl(transferControlKey(this.prefix, transferId));
    return asTransferControl(value);
  }

  private async readControl(key: string): Promise<unknown> {
    try {
      const response = await this.options.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      const text = await bodyText(response.Body);
      return text ? (JSON.parse(text) as unknown) : undefined;
    } catch (error) {
      const name = unknownRecord(error)?.['name'];
      if (name === 'NoSuchKey' || name === 'NotFound') return undefined;
      throw error;
    }
  }

  private async putControl(
    key: string,
    value: S3UploadControlV1 | S3TransferControlV1,
  ): Promise<void> {
    await this.options.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
        IfNoneMatch: '*',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.options.kmsKeyId,
      }),
    );
  }
}

export function createS3ArtifactUploadStorageAdapterV1(input: {
  readonly bucket: string;
  readonly region: string;
  readonly kmsKeyId: string;
  readonly keyPrefix?: string;
}): S3ArtifactUploadStorageAdapter {
  return new S3ArtifactUploadStorageAdapter({
    client: new S3Client({ region: input.region }),
    bucket: input.bucket,
    kmsKeyId: input.kmsKeyId,
    ...(input.keyPrefix ? { keyPrefix: input.keyPrefix } : {}),
  });
}
