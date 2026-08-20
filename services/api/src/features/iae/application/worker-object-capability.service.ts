import { randomUUID } from 'node:crypto';

import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  type IaeWorkerCapabilityRecordV1,
  type IaeWorkerCapabilityObjectBindingV1,
  type IaeWorkerCapabilityRepositoryPortV1,
  type IaeWorkerCapabilitySigningPayloadV1,
  type IaeWorkerIdentityV1,
  type IaeWorkerInputObjectGrantV1,
  type IaeWorkerInputObjectResolverPortV1,
  type IaeWorkerResultAcceptanceCapabilityV1,
  type IaeWorkerOutputObjectResolverPortV1,
  type IaeWorkerSecurityEpochPortV1,
  type IaeWorkerCapabilitySignerPortV1,
} from './worker-object-capability.port.js';

export type {
  IaeWorkerCapabilitySignerPortV1,
  IaeWorkerInputObjectResolverPortV1,
  IaeWorkerOutputObjectResolverPortV1,
} from './worker-object-capability.port.js';

export interface IaeWorkerObjectCapabilityPortV1 {
  issueInputGrant(
    identity: IaeWorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    nowInput?: unknown,
    options?: { readonly inputObjectIds?: readonly string[] },
  ): Promise<IaeWorkerCapabilityResultV1<IaeWorkerInputObjectGrantV1>>;
  acceptResultReferences(
    identity: IaeWorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    references: readonly string[],
    nowInput?: unknown,
  ): Promise<IaeWorkerCapabilityResultV1<readonly IaeWorkerResultAcceptanceCapabilityV1[]>>;
}

const MAX_OBJECTS = 128;
const MAX_GRANT_SECONDS = 300;
const MAX_CAPABILITY_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;

export type IaeWorkerCapabilityErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_SCOPE'
  | 'ATTEMPT_MISMATCH'
  | 'WORKER_MISMATCH'
  | 'ATTEMPT_INACTIVE'
  | 'LEASE_EXPIRED'
  | 'SECURITY_EPOCH_REVOKED'
  | 'CAPABILITY_REVOKED'
  | 'INPUT_OBJECTS_UNAVAILABLE'
  | 'INVALID_OBJECT_REFERENCE'
  | 'OUTPUT_OBJECT_REJECTED'
  | 'CAPABILITY_REPLAY'
  | 'CAPABILITY_SIGNING_UNAVAILABLE'
  | 'CAPABILITY_SIGNING_REJECTED';

export type IaeWorkerCapabilityResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IaeWorkerCapabilityErrorCodeV1 };

function rejected<TValue>(
  code: IaeWorkerCapabilityErrorCodeV1,
): IaeWorkerCapabilityResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function now(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function safeOpaqueReference(input: unknown): input is string {
  return typeof input === 'string' && OPAQUE_REFERENCE.test(input) && !input.includes('..');
}

function capabilityId(): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(randomUUID());
  if (!parsed.accepted) throw new Error('IAE_CAPABILITY_ID_GENERATION_FAILED');
  return parsed.value;
}

function expiresAt(
  issuedAt: StrictUtcTimestampV1,
  leaseExpiresAt: StrictUtcTimestampV1,
): StrictUtcTimestampV1 | undefined {
  const candidate = new Date(
    Math.min(Date.parse(leaseExpiresAt), Date.parse(issuedAt) + MAX_GRANT_SECONDS * 1000),
  ).toISOString();
  const parsed = parseStrictUtcTimestampV1(candidate);
  return parsed.accepted && Date.parse(parsed.value) > Date.parse(issuedAt)
    ? parsed.value
    : undefined;
}

function jobIsTerminal(job: JobV1): boolean {
  return (
    job.state === 'SUCCEEDED' ||
    job.state === 'PARTIALLY_SUCCEEDED' ||
    job.state === 'FAILED' ||
    job.state === 'CANCELLED' ||
    job.state === 'EXPIRED' ||
    job.state === 'CANCEL_REQUESTED'
  );
}

function validBytes(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function validIdentity(
  identity: IaeWorkerIdentityV1,
): identity is IaeWorkerIdentityV1 & { readonly workerId: StableIdentifierV1 } {
  return (
    Boolean(stable(identity?.workerId)) &&
    Boolean(stable(identity?.correlationId)) &&
    Number.isSafeInteger(identity?.securityEpoch) &&
    identity.securityEpoch >= 1
  );
}

function contentSafeObjectIds(objectIds: readonly string[]): boolean {
  return (
    objectIds.length > 0 &&
    objectIds.length <= MAX_OBJECTS &&
    new Set(objectIds).size === objectIds.length &&
    objectIds.every((objectId) => safeOpaqueReference(objectId))
  );
}

function validInputBindings(
  bindings: readonly IaeWorkerCapabilityObjectBindingV1[],
  maximumBytes: number,
): boolean {
  return (
    bindings.length > 0 &&
    bindings.length <= MAX_OBJECTS &&
    new Set(bindings.map(({ objectId }) => objectId)).size === bindings.length &&
    bindings.every(
      ({ objectId, contentSha256, contentLength }) =>
        safeOpaqueReference(objectId) &&
        typeof contentSha256 === 'string' &&
        /^[a-f0-9]{64}$/u.test(contentSha256) &&
        Number.isSafeInteger(contentLength) &&
        contentLength !== undefined &&
        contentLength >= 0,
    ) &&
    bindings.reduce((total, { contentLength = 0 }) => total + contentLength, 0) <= maximumBytes
  );
}

function validResultReferences(input: unknown): input is readonly string[] {
  return (
    Array.isArray(input) &&
    input.length <= MAX_OBJECTS &&
    new Set(input).size === input.length &&
    input.every((reference): reference is string => safeOpaqueReference(reference))
  );
}

function recordRevoked(record: IaeWorkerCapabilityRecordV1 | undefined): boolean {
  return record?.revokedAt !== undefined;
}

function result<TValue>(value: TValue): IaeWorkerCapabilityResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function inputGrantFromRecord(
  record: IaeWorkerCapabilityRecordV1,
  signedCapability: string,
): IaeWorkerInputObjectGrantV1 {
  return Object.freeze({
    schemaVersion: 1,
    grantType: 'JOB_INPUT',
    capabilityId: record.capabilityId,
    attemptId: record.attemptId,
    jobId: record.jobId,
    workerId: record.workerId,
    securityEpoch: record.securityEpoch,
    tenantScope: record.tenantScope,
    objectIds: record.objectIds,
    actions: ['READ'] as const,
    maxBytes: record.maxBytes,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    signedCapability,
  });
}

/**
 * IAE-owned capability issuer/acceptor. JRA supplies the authenticated worker snapshot and
 * exact job/attempt; IAE owns object ACLs, signing, expiry, and durable revocation receipts.
 */
export class IaeWorkerObjectCapabilityService implements IaeWorkerObjectCapabilityPortV1 {
  public constructor(
    private readonly repository: IaeWorkerCapabilityRepositoryPortV1,
    private readonly inputObjects: IaeWorkerInputObjectResolverPortV1,
    private readonly outputObjects: IaeWorkerOutputObjectResolverPortV1,
    private readonly signer: IaeWorkerCapabilitySignerPortV1,
    private readonly securityEpoch: IaeWorkerSecurityEpochPortV1,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private validateCommon(
    identity: IaeWorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    issuedAt: StrictUtcTimestampV1,
  ): IaeWorkerCapabilityErrorCodeV1 | undefined {
    if (!validIdentity(identity)) return 'INVALID_IDENTIFIER';
    if (!tenantScopesEqualV1(identity.tenantScope, job.tenantScope)) return 'INVALID_SCOPE';
    if (!tenantScopesEqualV1(identity.tenantScope, attempt.tenantScope)) return 'INVALID_SCOPE';
    if (attempt.jobId !== job.jobId) return 'ATTEMPT_MISMATCH';
    if (attempt.executorId !== identity.workerId) return 'WORKER_MISMATCH';
    if (attempt.executorType !== 'CLOUD_WORKER') return 'WORKER_MISMATCH';
    if (attempt.state !== 'CLAIMED' && attempt.state !== 'RUNNING') return 'ATTEMPT_INACTIVE';
    if (jobIsTerminal(job)) return 'ATTEMPT_INACTIVE';
    if (Date.parse(attempt.leaseExpiresAt) <= Date.parse(issuedAt)) return 'LEASE_EXPIRED';
    return undefined;
  }

  private async signedCapability(
    payload: IaeWorkerCapabilitySigningPayloadV1,
  ): Promise<IaeWorkerCapabilityResultV1<string>> {
    let signed: string;
    try {
      signed = await this.signer.sign(payload);
    } catch {
      return rejected('CAPABILITY_SIGNING_UNAVAILABLE');
    }
    if (
      typeof signed !== 'string' ||
      signed.length === 0 ||
      signed.length > 4096 ||
      /[\p{Cc}]/u.test(signed) ||
      /^file:/iu.test(signed) ||
      /^[a-z]:[\\/]/iu.test(signed) ||
      signed.startsWith('\\\\')
    )
      return rejected('CAPABILITY_SIGNING_REJECTED');
    return result(signed);
  }

  public async issueInputGrant(
    identity: IaeWorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    nowInput: unknown = this.clock(),
    options?: { readonly inputObjectIds?: readonly string[] },
  ): Promise<IaeWorkerCapabilityResultV1<IaeWorkerInputObjectGrantV1>> {
    const issuedAt = now(nowInput);
    if (!issuedAt) return rejected('INVALID_TIMESTAMP');
    const commonFailure = this.validateCommon(identity, job, attempt, issuedAt);
    if (commonFailure) return rejected(commonFailure);
    if (!(await this.securityEpoch.isCurrent(identity))) return rejected('SECURITY_EPOCH_REVOKED');
    const expiry = expiresAt(issuedAt, attempt.leaseExpiresAt);
    if (!expiry) return rejected('LEASE_EXPIRED');

    return this.repository.withTransaction(identity.tenantScope, async (transaction) => {
      const existing = await transaction.findInput(identity.tenantScope, attempt.attemptId);
      if (recordRevoked(existing)) return rejected('CAPABILITY_REVOKED');
      if (existing && existing.securityEpoch !== identity.securityEpoch)
        return rejected('SECURITY_EPOCH_REVOKED');
      if (existing && existing.workerId !== identity.workerId) return rejected('WORKER_MISMATCH');
      if (existing) {
        if (Date.parse(existing.expiresAt) <= Date.parse(issuedAt))
          return rejected('LEASE_EXPIRED');
        const signature = await this.signedCapability({
          capabilityId: existing.capabilityId,
          grantType: 'JOB_INPUT',
          tenantScope: existing.tenantScope,
          jobId: existing.jobId,
          attemptId: existing.attemptId,
          workerId: existing.workerId,
          securityEpoch: existing.securityEpoch,
          objectIds: existing.objectIds,
          objectBindings: existing.objectBindings,
          action: 'READ',
          maxBytes: existing.maxBytes,
          issuedAt: existing.issuedAt,
          expiresAt: existing.expiresAt,
          ...(existing.resultFinalizationBinding === undefined
            ? {}
            : { resultFinalizationBinding: existing.resultFinalizationBinding }),
        });
        if (!signature.accepted) return signature;
        return result(inputGrantFromRecord(existing, signature.value));
      }

      const resolved = await this.inputObjects.resolveInputObjects({
        tenantScope: identity.tenantScope,
        job,
        attempt,
        ...(options?.inputObjectIds === undefined
          ? {}
          : { inputObjectIds: options.inputObjectIds }),
      });
      if (!resolved.accepted) return rejected(resolved.code);
      const objectBindings = resolved.value.objects.map((binding) => Object.freeze({ ...binding }));
      const objectIds = objectBindings.map(({ objectId }) => objectId);
      if (
        !contentSafeObjectIds(objectIds) ||
        !validBytes(resolved.value.maxBytes, MAX_CAPABILITY_BYTES) ||
        !validInputBindings(objectBindings, resolved.value.maxBytes)
      )
        return rejected('INVALID_OBJECT_REFERENCE');
      const id = capabilityId();
      const signature = await this.signedCapability({
        capabilityId: id,
        grantType: 'JOB_INPUT',
        tenantScope: identity.tenantScope,
        jobId: job.jobId,
        attemptId: attempt.attemptId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        objectIds,
        objectBindings,
        action: 'READ',
        maxBytes: resolved.value.maxBytes,
        issuedAt,
        expiresAt: expiry,
      });
      if (!signature.accepted) return signature;
      const record: IaeWorkerCapabilityRecordV1 = Object.freeze({
        schemaVersion: 1,
        grantType: 'JOB_INPUT',
        capabilityId: id,
        attemptId: attempt.attemptId,
        jobId: job.jobId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        tenantScope: identity.tenantScope,
        objectIds: Object.freeze(objectIds),
        objectBindings: Object.freeze(objectBindings),
        action: 'READ',
        maxBytes: resolved.value.maxBytes,
        issuedAt,
        expiresAt: expiry,
      });
      await transaction.save(record);
      return result(inputGrantFromRecord(record, signature.value));
    });
  }

  public async acceptResultReferences(
    identity: IaeWorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    references: readonly string[],
    nowInput: unknown = this.clock(),
  ): Promise<IaeWorkerCapabilityResultV1<readonly IaeWorkerResultAcceptanceCapabilityV1[]>> {
    const issuedAt = now(nowInput);
    if (!issuedAt) return rejected('INVALID_TIMESTAMP');
    const commonFailure = this.validateCommon(identity, job, attempt, issuedAt);
    if (commonFailure) return rejected(commonFailure);
    if (!(await this.securityEpoch.isCurrent(identity))) return rejected('SECURITY_EPOCH_REVOKED');
    if (!validResultReferences(references)) return rejected('INVALID_OBJECT_REFERENCE');
    const expiry = expiresAt(issuedAt, attempt.leaseExpiresAt);
    if (!expiry) return rejected('LEASE_EXPIRED');

    return this.repository.withTransaction(identity.tenantScope, async (transaction) => {
      const existingInput = await transaction.findInput(identity.tenantScope, attempt.attemptId);
      if (recordRevoked(existingInput)) return rejected('CAPABILITY_REVOKED');
      if (existingInput && existingInput.securityEpoch !== identity.securityEpoch)
        return rejected('SECURITY_EPOCH_REVOKED');
      const existingOutputs = await Promise.all(
        references.map((reference) =>
          transaction.findOutput(identity.tenantScope, attempt.attemptId, reference),
        ),
      );
      if (existingOutputs.some((record) => recordRevoked(record)))
        return rejected('CAPABILITY_REVOKED');
      if (existingOutputs.some((record) => record !== undefined)) {
        if (existingOutputs.some((record) => record === undefined))
          return rejected('CAPABILITY_REPLAY');
        const replayed: IaeWorkerResultAcceptanceCapabilityV1[] = [];
        for (const record of existingOutputs) {
          if (
            record === undefined ||
            record.workerId !== identity.workerId ||
            record.securityEpoch !== identity.securityEpoch ||
            record.jobId !== job.jobId ||
            Date.parse(record.expiresAt) <= Date.parse(issuedAt)
          )
            return rejected('CAPABILITY_REPLAY');
          const signature = await this.signedCapability({
            capabilityId: record.capabilityId,
            grantType: 'JOB_OUTPUT',
            tenantScope: record.tenantScope,
            jobId: record.jobId,
            attemptId: record.attemptId,
            workerId: record.workerId,
            securityEpoch: record.securityEpoch,
            objectIds: record.objectIds,
            objectBindings: record.objectBindings,
            action: 'WRITE',
            maxBytes: record.maxBytes,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            ...(record.resultFinalizationBinding === undefined
              ? {}
              : { resultFinalizationBinding: record.resultFinalizationBinding }),
          });
          if (!signature.accepted) return signature;
          replayed.push(
            Object.freeze({
              schemaVersion: 1 as const,
              grantType: 'JOB_OUTPUT' as const,
              capabilityId: record.capabilityId,
              attemptId: record.attemptId,
              jobId: record.jobId,
              workerId: record.workerId,
              securityEpoch: record.securityEpoch,
              tenantScope: record.tenantScope,
              objectId: record.objectIds[0]!,
              action: 'WRITE' as const,
              maxBytes: record.maxBytes,
              issuedAt: record.issuedAt,
              expiresAt: record.expiresAt,
              signedCapability: signature.value,
            }),
          );
        }
        return result(Object.freeze(replayed));
      }

      for (const objectId of references) {
        if (
          !(await this.outputObjects.isResultObjectAllowed({
            tenantScope: identity.tenantScope,
            job,
            attempt,
            objectId,
          }))
        )
          return rejected('OUTPUT_OBJECT_REJECTED');
      }

      const capabilities: IaeWorkerResultAcceptanceCapabilityV1[] = [];
      const records: IaeWorkerCapabilityRecordV1[] = [];
      for (const objectId of references) {
        const id = capabilityId();
        const signature = await this.signedCapability({
          capabilityId: id,
          grantType: 'JOB_OUTPUT',
          tenantScope: identity.tenantScope,
          jobId: job.jobId,
          attemptId: attempt.attemptId,
          workerId: identity.workerId,
          securityEpoch: identity.securityEpoch,
          objectIds: [objectId],
          objectBindings: [{ objectId }],
          action: 'WRITE',
          maxBytes: MAX_OUTPUT_BYTES,
          issuedAt,
          expiresAt: expiry,
        });
        if (!signature.accepted) return signature;
        records.push(
          Object.freeze({
            schemaVersion: 1 as const,
            grantType: 'JOB_OUTPUT' as const,
            capabilityId: id,
            attemptId: attempt.attemptId,
            jobId: job.jobId,
            workerId: identity.workerId,
            securityEpoch: identity.securityEpoch,
            tenantScope: identity.tenantScope,
            objectIds: Object.freeze([objectId]),
            objectBindings: Object.freeze([Object.freeze({ objectId })]),
            action: 'WRITE' as const,
            maxBytes: MAX_OUTPUT_BYTES,
            issuedAt,
            expiresAt: expiry,
          }),
        );
        capabilities.push(
          Object.freeze({
            schemaVersion: 1 as const,
            grantType: 'JOB_OUTPUT' as const,
            capabilityId: id,
            attemptId: attempt.attemptId,
            jobId: job.jobId,
            workerId: identity.workerId,
            securityEpoch: identity.securityEpoch,
            tenantScope: identity.tenantScope,
            objectId,
            action: 'WRITE' as const,
            maxBytes: MAX_OUTPUT_BYTES,
            issuedAt,
            expiresAt: expiry,
            signedCapability: signature.value,
          }),
        );
      }
      for (const record of records) await transaction.save(record);
      return result(Object.freeze(capabilities));
    });
  }

  public async revokeForAttempt(
    tenantScope: IaeWorkerIdentityV1['tenantScope'],
    attemptIdInput: unknown,
    revokedAtInput: unknown = this.clock(),
  ): Promise<IaeWorkerCapabilityResultV1<true>> {
    const attemptId = stable(attemptIdInput);
    const revokedAt = now(revokedAtInput);
    if (!attemptId) return rejected('INVALID_IDENTIFIER');
    if (!revokedAt) return rejected('INVALID_TIMESTAMP');
    await this.repository.revokeForAttempt(tenantScope, attemptId, revokedAt);
    return result(true);
  }
}
