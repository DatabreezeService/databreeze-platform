import { createHash } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerCapabilityObjectBindingV1,
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilitySigningPayloadV1,
  IaeWorkerCapabilityVerifierPortV1,
  IaeWorkerIdentityV1,
  IaeWorkerObjectTransferReceiptV1,
  IaeWorkerSecurityEpochPortV1,
} from './worker-object-capability.port.js';
import type { IaeWorkerObjectByteStorePortV1 } from './worker-object-transfer.port.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;

export type IaeWorkerObjectTransferErrorCodeV1 =
  | 'TRANSFER_DENIED'
  | 'INVALID_TRANSFER'
  | 'MAX_BYTES_EXCEEDED'
  | 'CONTENT_HASH_MISMATCH'
  | 'CONTENT_LENGTH_MISMATCH'
  | 'OBJECT_UNAVAILABLE'
  | 'TRANSFER_REPLAY';

export type IaeWorkerObjectTransferResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IaeWorkerObjectTransferErrorCodeV1 };

export interface IaeWorkerObjectReadResultV1 {
  readonly objectId: string;
  readonly bytes: Uint8Array;
  readonly contentSha256: string;
  readonly contentLength: number;
}

function accepted<TValue>(value: TValue): IaeWorkerObjectTransferResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function denied<TValue>(
  code: IaeWorkerObjectTransferErrorCodeV1,
): IaeWorkerObjectTransferResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function safeObjectId(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    OPAQUE_REFERENCE.test(input) &&
    !input.includes('..') &&
    !input.includes('/') &&
    !input.includes('\\')
  );
}

function signingPayload(record: IaeWorkerCapabilityRecordV1): IaeWorkerCapabilitySigningPayloadV1 {
  return {
    capabilityId: record.capabilityId,
    grantType: record.grantType,
    tenantScope: record.tenantScope,
    jobId: record.jobId,
    attemptId: record.attemptId,
    workerId: record.workerId,
    securityEpoch: record.securityEpoch,
    objectIds: record.objectIds,
    objectBindings: record.objectBindings,
    action: record.action,
    maxBytes: record.maxBytes,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    ...(record.resultFinalizationBinding === undefined
      ? {}
      : { resultFinalizationBinding: record.resultFinalizationBinding }),
  };
}

function exactBinding(
  record: IaeWorkerCapabilityRecordV1,
  objectId: string,
): IaeWorkerCapabilityObjectBindingV1 | undefined {
  return record.objectBindings.find((binding) => binding.objectId === objectId);
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Consumes only an IAE-issued signed capability and one exact object ID. Authentication is
 * supplied by the internal worker boundary; any binding mismatch is deliberately collapsed to
 * TRANSFER_DENIED so the endpoint cannot become an object or workspace enumeration oracle.
 */
export class IaeWorkerObjectTransferService {
  public constructor(
    private readonly repository: IaeWorkerCapabilityRepositoryPortV1,
    private readonly verifier: IaeWorkerCapabilityVerifierPortV1,
    private readonly securityEpoch: IaeWorkerSecurityEpochPortV1,
    private readonly objects: IaeWorkerObjectByteStorePortV1,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private async authorize(
    identity: IaeWorkerIdentityV1,
    input: {
      readonly capabilityId: unknown;
      readonly signedCapability: unknown;
      readonly attemptId: unknown;
      readonly objectId: unknown;
      readonly now?: unknown;
    },
    action: 'READ' | 'WRITE',
  ): Promise<
    | {
        readonly accepted: true;
        readonly record: IaeWorkerCapabilityRecordV1;
        readonly binding: IaeWorkerCapabilityObjectBindingV1;
        readonly now: StrictUtcTimestampV1;
      }
    | { readonly accepted: false }
  > {
    const capabilityId = stable(input.capabilityId);
    const attemptId = stable(input.attemptId);
    const workerId = stable(identity?.workerId);
    const correlationId = stable(identity?.correlationId);
    const now = timestamp(input.now ?? this.clock());
    if (
      !capabilityId ||
      !attemptId ||
      !workerId ||
      !correlationId ||
      !now ||
      !safeObjectId(input.objectId) ||
      typeof input.signedCapability !== 'string' ||
      input.signedCapability.length === 0 ||
      input.signedCapability.length > 4096 ||
      !Number.isSafeInteger(identity.securityEpoch) ||
      identity.securityEpoch < 1
    )
      return { accepted: false };

    const record = await this.repository.findByCapability(identity.tenantScope, capabilityId);
    const binding = record ? exactBinding(record, input.objectId) : undefined;
    if (
      !record ||
      !binding ||
      record.capabilityId !== capabilityId ||
      record.attemptId !== attemptId ||
      record.workerId !== workerId ||
      !tenantScopesEqualV1(record.tenantScope, identity.tenantScope) ||
      record.securityEpoch !== identity.securityEpoch ||
      record.action !== action ||
      record.grantType !== (action === 'READ' ? 'JOB_INPUT' : 'JOB_OUTPUT') ||
      record.revokedAt !== undefined ||
      Date.parse(record.issuedAt) > Date.parse(now) ||
      Date.parse(record.expiresAt) <= Date.parse(now) ||
      !(await this.securityEpoch.isCurrent(identity))
    )
      return { accepted: false };
    try {
      if (!(await this.verifier.verify(signingPayload(record), input.signedCapability)))
        return { accepted: false };
    } catch {
      return { accepted: false };
    }
    return { accepted: true, record, binding, now };
  }

  public async read(
    identity: IaeWorkerIdentityV1,
    input: {
      readonly capabilityId: unknown;
      readonly signedCapability: unknown;
      readonly attemptId: unknown;
      readonly objectId: unknown;
      readonly now?: unknown;
    },
  ): Promise<IaeWorkerObjectTransferResultV1<IaeWorkerObjectReadResultV1>> {
    const authorization = await this.authorize(identity, input, 'READ');
    if (!authorization.accepted) return denied('TRANSFER_DENIED');
    const { binding, record } = authorization;
    if (
      binding.contentLength === undefined ||
      binding.contentSha256 === undefined ||
      !Number.isSafeInteger(binding.contentLength) ||
      binding.contentLength < 0 ||
      binding.contentLength > record.maxBytes ||
      !SHA256.test(binding.contentSha256)
    )
      return denied('TRANSFER_DENIED');

    const loaded = await this.objects.readExact({
      tenantScope: identity.tenantScope,
      objectId: binding.objectId,
      maximumByteLength: record.maxBytes,
    });
    if (!loaded.accepted)
      return denied(
        loaded.code === 'OBJECT_OVERSIZE' ? 'MAX_BYTES_EXCEEDED' : 'OBJECT_UNAVAILABLE',
      );
    const actualLength = loaded.value.bytes.byteLength;
    if (
      actualLength !== binding.contentLength ||
      loaded.value.contentLength !== binding.contentLength
    )
      return denied('CONTENT_LENGTH_MISMATCH');
    const actualDigest = digest(loaded.value.bytes);
    if (
      actualDigest !== binding.contentSha256 ||
      loaded.value.contentSha256 !== binding.contentSha256
    )
      return denied('CONTENT_HASH_MISMATCH');
    return accepted(
      Object.freeze({
        objectId: binding.objectId,
        bytes: new Uint8Array(loaded.value.bytes),
        contentSha256: binding.contentSha256,
        contentLength: binding.contentLength,
      }),
    );
  }

  public async write(
    identity: IaeWorkerIdentityV1,
    input: {
      readonly capabilityId: unknown;
      readonly signedCapability: unknown;
      readonly attemptId: unknown;
      readonly objectId: unknown;
      readonly bytes: unknown;
      readonly contentSha256: unknown;
      readonly contentLength: unknown;
      readonly now?: unknown;
    },
  ): Promise<IaeWorkerObjectTransferResultV1<IaeWorkerObjectTransferReceiptV1>> {
    const authorization = await this.authorize(identity, input, 'WRITE');
    if (!authorization.accepted) return denied('TRANSFER_DENIED');
    const { binding, record, now } = authorization;
    if (
      !(input.bytes instanceof Uint8Array) ||
      typeof input.contentSha256 !== 'string' ||
      !SHA256.test(input.contentSha256) ||
      typeof input.contentLength !== 'number' ||
      !Number.isSafeInteger(input.contentLength) ||
      input.contentLength < 0
    )
      return denied('INVALID_TRANSFER');
    if (input.contentLength > record.maxBytes || input.bytes.byteLength > record.maxBytes)
      return denied('MAX_BYTES_EXCEEDED');
    if (input.bytes.byteLength !== input.contentLength) return denied('CONTENT_LENGTH_MISMATCH');
    if (digest(input.bytes) !== input.contentSha256) return denied('CONTENT_HASH_MISMATCH');

    const receipt = Object.freeze({
      objectId: binding.objectId,
      contentSha256: input.contentSha256,
      contentLength: input.contentLength,
      transferredAt: now,
    });
    if (record.transferReceipt !== undefined) {
      if (
        record.transferReceipt.objectId !== receipt.objectId ||
        record.transferReceipt.contentSha256 !== receipt.contentSha256 ||
        record.transferReceipt.contentLength !== receipt.contentLength
      )
        return denied('TRANSFER_REPLAY');
      return accepted(record.transferReceipt);
    }

    const stored = await this.objects.writeExact({
      tenantScope: identity.tenantScope,
      objectId: binding.objectId,
      bytes: input.bytes,
      contentSha256: input.contentSha256,
      contentLength: input.contentLength,
      maximumByteLength: record.maxBytes,
    });
    if (!stored.accepted) {
      if (stored.code === 'OBJECT_OVERSIZE') return denied('MAX_BYTES_EXCEEDED');
      if (stored.code === 'OBJECT_IMMUTABLE') return denied('TRANSFER_REPLAY');
      return denied('OBJECT_UNAVAILABLE');
    }
    if (stored.value.contentLength !== receipt.contentLength)
      return denied('CONTENT_LENGTH_MISMATCH');
    if (stored.value.contentSha256 !== receipt.contentSha256)
      return denied('CONTENT_HASH_MISMATCH');

    const recorded = await this.repository.recordTransferReceipt(
      identity.tenantScope,
      record.capabilityId,
      receipt,
    );
    if (recorded === 'CONFLICT' || recorded === 'NOT_FOUND') return denied('TRANSFER_REPLAY');
    return accepted(receipt);
  }
}
