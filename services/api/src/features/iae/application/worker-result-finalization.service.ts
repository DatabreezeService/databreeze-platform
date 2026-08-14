import { createHash, randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityVerifierPortV1,
  IaeWorkerIdentityV1,
  IaeWorkerSecurityEpochPortV1,
} from './worker-object-capability.port.js';
import type {
  IaeWorkerResultFinalizationAttestationV1,
  IaeWorkerResultFinalizationCommandV1,
  IaeWorkerResultFinalizationErrorCodeV1,
  IaeWorkerResultFinalizationPortV1,
  IaeWorkerResultFinalizationResultV1,
} from './worker-result-finalization.port.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const OPAQUE_OBJECT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const PROCESSOR_VERSION = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/u;

export interface IaeWorkerResultArtifactVersionDraftV1 {
  readonly id: StableIdentifierV1;
  readonly artifactId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceKind: 'GENERATED';
  readonly dataMode: 'Hybrid' | 'Cloud';
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly displayName: 'worker-result';
  readonly createdAt: IaeWorkerResultFinalizationAttestationV1['finalizedAt'];
  readonly status: 'ACTIVE';
  readonly scanState: 'CLEAN';
}

export interface IaeWorkerResultPlacementDraftV1 {
  readonly id: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly kind: 'CLOUD_OBJECT';
  readonly opaqueReference: string;
  readonly contentSha256: string;
  readonly payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' | 'APPROVED_DERIVED_RESULT';
  readonly available: true;
  readonly revision: 1;
  readonly createdAt: IaeWorkerResultFinalizationAttestationV1['finalizedAt'];
}

export interface IaeWorkerResultLineageDraftV1 {
  readonly id: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly derivedArtifactVersionId: StableIdentifierV1;
  readonly sourceVersionIds: readonly StableIdentifierV1[];
  readonly processorVersion: string;
  readonly recipeVersion: StableIdentifierV1;
  readonly coordinateLineage: { readonly sourceLineageHash: string };
  readonly createdAt: IaeWorkerResultFinalizationAttestationV1['finalizedAt'];
}

export interface IaeWorkerResultFinalizationSaveV1 {
  readonly requestHash: string;
  readonly artifactVersion: IaeWorkerResultArtifactVersionDraftV1;
  readonly placement: IaeWorkerResultPlacementDraftV1;
  readonly lineage: IaeWorkerResultLineageDraftV1;
  readonly attestation: IaeWorkerResultFinalizationAttestationV1;
}

export interface IaeWorkerStoredFinalizationV1 {
  readonly requestHash: string;
  readonly attestation: IaeWorkerResultFinalizationAttestationV1;
}

export interface IaeWorkerResultFinalizationTransactionPortV1 {
  findCapability(
    tenantScope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined>;
  findAttestationBySubmission(
    tenantScope: TenantScopeV1,
    submissionId: StableIdentifierV1,
  ): Promise<IaeWorkerStoredFinalizationV1 | undefined>;
  saveFinalization(input: IaeWorkerResultFinalizationSaveV1): Promise<void>;
}

export interface IaeWorkerResultFinalizationRepositoryPortV1 {
  withTransaction<TValue>(
    tenantScope: TenantScopeV1,
    work: (transaction: IaeWorkerResultFinalizationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
  findAttestationBySubmission(
    tenantScope: TenantScopeV1,
    submissionId: StableIdentifierV1,
  ): Promise<IaeWorkerStoredFinalizationV1 | undefined>;
}

function reject(code: IaeWorkerResultFinalizationErrorCodeV1): IaeWorkerResultFinalizationResultV1 {
  return Object.freeze({ accepted: false, code });
}

function stable(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function sourceIds(value: unknown): readonly StableIdentifierV1[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) return undefined;
  const parsed = value.map(stable);
  if (parsed.some((candidate) => candidate === undefined)) return undefined;
  const ids = parsed as StableIdentifierV1[];
  return new Set(ids).size === ids.length ? Object.freeze(ids) : undefined;
}

function safeObject(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_OBJECT.test(value) && !value.includes('..');
}

function sourceHash(
  sourceArtifactVersionIds: readonly StableIdentifierV1[],
  processorVersion: string,
) {
  return createHash('sha256')
    .update(JSON.stringify({ sourceArtifactVersionIds, processorVersion }), 'utf8')
    .digest('hex');
}

function requestHash(command: IaeWorkerResultFinalizationCommandV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        submissionId: command.submissionId,
        capabilityId: command.capabilityId,
        attemptId: command.attemptId,
        executionDescriptorId: command.executionDescriptorId,
        objectId: command.objectId,
        contentSha256: command.contentSha256,
        contentLength: command.contentLength,
        mediaType: command.mediaType,
      }),
      'utf8',
    )
    .digest('hex');
}

function idFrom(factory: () => string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(factory());
  if (!parsed.accepted) throw new Error('IAE_WORKER_RESULT_ID_GENERATION_FAILED');
  return parsed.value;
}

export class IaeWorkerResultFinalizationService implements IaeWorkerResultFinalizationPortV1 {
  public constructor(
    private readonly repository: IaeWorkerResultFinalizationRepositoryPortV1,
    private readonly verifier: IaeWorkerCapabilityVerifierPortV1,
    private readonly securityEpoch: IaeWorkerSecurityEpochPortV1,
    private readonly idFactory: () => string = randomUUID,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  public async finalize(
    identity: IaeWorkerIdentityV1,
    input: IaeWorkerResultFinalizationCommandV1,
    nowInput: unknown = this.clock(),
  ): Promise<IaeWorkerResultFinalizationResultV1> {
    const finalizedAtResult = parseStrictUtcTimestampV1(nowInput);
    if (!finalizedAtResult.accepted) return reject('INVALID_TIMESTAMP');
    const command = this.parseCommand(input);
    if (command === undefined || !stable(identity.workerId) || !stable(identity.correlationId))
      return reject('INVALID_COMMAND');
    if (!Number.isSafeInteger(identity.securityEpoch) || identity.securityEpoch < 1)
      return reject('SECURITY_EPOCH_REVOKED');
    const hash = requestHash(command);

    try {
      return await this.repository.withTransaction(identity.tenantScope, async (transaction) => {
        const capability = await transaction.findCapability(
          identity.tenantScope,
          command.capabilityId,
        );
        if (capability === undefined) return reject('CAPABILITY_NOT_FOUND');
        const capabilityFailure = await this.validateCapability(
          identity,
          command,
          capability,
          finalizedAtResult.value,
        );
        if (capabilityFailure !== undefined) return reject(capabilityFailure);

        const existing = await transaction.findAttestationBySubmission(
          identity.tenantScope,
          command.submissionId,
        );
        if (existing !== undefined)
          return existing.requestHash === hash
            ? Object.freeze({ accepted: true as const, value: existing.attestation })
            : reject('IDEMPOTENCY_CONFLICT');

        const binding = capability.resultFinalizationBinding!;
        const receipt = capability.transferReceipt;
        if (receipt === undefined) return reject('TRANSFER_RECEIPT_MISSING');
        if (
          receipt.objectId !== command.objectId ||
          receipt.contentSha256 !== command.contentSha256
        )
          return reject('TRANSFER_RECEIPT_MISMATCH');
        if (
          receipt.contentLength !== command.contentLength ||
          command.contentLength > capability.maxBytes ||
          binding.mediaType !== command.mediaType ||
          binding.contentSha256 !== command.contentSha256 ||
          binding.contentLength !== command.contentLength
        )
          return reject('OUTPUT_POLICY_MISMATCH');
        if (
          sourceHash(binding.sourceArtifactVersionIds, binding.processorVersion) !==
          binding.sourceLineageHash
        )
          return reject('SOURCE_LINEAGE_MISMATCH');

        const attestation = Object.freeze({
          schemaVersion: 1 as const,
          attestationId: idFrom(this.idFactory),
          tenantScope: identity.tenantScope,
          jobId: capability.jobId,
          attemptId: capability.attemptId,
          executionDescriptorId: binding.executionDescriptorId,
          executionDescriptorHash: binding.executionDescriptorHash,
          submissionId: binding.submissionId,
          artifactVersionId: binding.artifactVersionId,
          contentSha256: receipt.contentSha256,
          contentLength: receipt.contentLength,
          mediaType: binding.mediaType,
          sourceLineageHash: binding.sourceLineageHash,
          outputPolicyHash: binding.outputPolicyHash,
          finalizedAt: finalizedAtResult.value,
        }) satisfies IaeWorkerResultFinalizationAttestationV1;
        await transaction.saveFinalization({
          requestHash: hash,
          artifactVersion: Object.freeze({
            id: binding.artifactVersionId,
            artifactId: binding.artifactId,
            tenantScope: identity.tenantScope,
            sourceKind: 'GENERATED',
            dataMode: binding.dataMode,
            contentSha256: receipt.contentSha256,
            byteSize: receipt.contentLength,
            mediaType: binding.mediaType,
            displayName: 'worker-result',
            createdAt: finalizedAtResult.value,
            status: 'ACTIVE',
            scanState: 'CLEAN',
          }),
          placement: Object.freeze({
            id: binding.placementId,
            artifactVersionId: binding.artifactVersionId,
            tenantScope: identity.tenantScope,
            kind: 'CLOUD_OBJECT',
            opaqueReference: binding.objectId,
            contentSha256: receipt.contentSha256,
            payloadClass: binding.payloadClass,
            available: true,
            revision: 1,
            createdAt: finalizedAtResult.value,
          }),
          lineage: Object.freeze({
            id: binding.lineageId,
            tenantScope: identity.tenantScope,
            derivedArtifactVersionId: binding.artifactVersionId,
            sourceVersionIds: binding.sourceArtifactVersionIds,
            processorVersion: binding.processorVersion,
            recipeVersion: binding.executionDescriptorId,
            coordinateLineage: { sourceLineageHash: binding.sourceLineageHash },
            createdAt: finalizedAtResult.value,
          }),
          attestation,
        });
        return Object.freeze({ accepted: true, value: attestation });
      });
    } catch (error) {
      const uniqueConflict =
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002') ||
        (error instanceof Error && /unique/iu.test(error.message));
      if (uniqueConflict) {
        try {
          const raced = await this.repository.findAttestationBySubmission(
            identity.tenantScope,
            command.submissionId,
          );
          if (raced !== undefined)
            return raced.requestHash === hash
              ? Object.freeze({ accepted: true, value: raced.attestation })
              : reject('IDEMPOTENCY_CONFLICT');
        } catch {
          return reject('PERSISTENCE_UNAVAILABLE');
        }
      }
      return error instanceof Error && error.message.includes('IDEMPOTENCY')
        ? reject('IDEMPOTENCY_CONFLICT')
        : reject('PERSISTENCE_UNAVAILABLE');
    }
  }

  private parseCommand(
    input: IaeWorkerResultFinalizationCommandV1,
  ): IaeWorkerResultFinalizationCommandV1 | undefined {
    const command = {
      submissionId: stable(input?.submissionId),
      capabilityId: stable(input?.capabilityId),
      attemptId: stable(input?.attemptId),
      executionDescriptorId: stable(input?.executionDescriptorId),
    };
    if (
      Object.values(command).some((value) => value === undefined) ||
      typeof input.signedCapability !== 'string' ||
      input.signedCapability.length === 0 ||
      input.signedCapability.length > 4096 ||
      !safeObject(input.objectId) ||
      !SHA256.test(input.contentSha256) ||
      !Number.isSafeInteger(input.contentLength) ||
      input.contentLength < 0 ||
      !MEDIA_TYPE.test(input.mediaType)
    )
      return undefined;
    return Object.freeze({
      submissionId: command.submissionId!,
      capabilityId: command.capabilityId!,
      signedCapability: input.signedCapability,
      attemptId: command.attemptId!,
      executionDescriptorId: command.executionDescriptorId!,
      objectId: input.objectId,
      contentSha256: input.contentSha256,
      contentLength: input.contentLength,
      mediaType: input.mediaType,
    });
  }

  private async validateCapability(
    identity: IaeWorkerIdentityV1,
    command: IaeWorkerResultFinalizationCommandV1,
    capability: IaeWorkerCapabilityRecordV1,
    finalizedAt: IaeWorkerResultFinalizationAttestationV1['finalizedAt'],
  ): Promise<IaeWorkerResultFinalizationErrorCodeV1 | undefined> {
    const binding = capability.resultFinalizationBinding;
    if (!tenantScopesEqualV1(identity.tenantScope, capability.tenantScope)) return 'INVALID_SCOPE';
    if (
      capability.workerId !== identity.workerId ||
      capability.securityEpoch !== identity.securityEpoch
    )
      return 'SECURITY_EPOCH_REVOKED';
    if (capability.revokedAt !== undefined) return 'ATTEMPT_SUPERSEDED';
    if (Date.parse(capability.expiresAt) <= Date.parse(finalizedAt)) return 'CAPABILITY_EXPIRED';
    if (
      capability.grantType !== 'JOB_OUTPUT' ||
      capability.action !== 'WRITE' ||
      binding === undefined ||
      !stable(binding.submissionId) ||
      !stable(binding.executionDescriptorId) ||
      !stable(binding.artifactId) ||
      !stable(binding.artifactVersionId) ||
      !stable(binding.placementId) ||
      !stable(binding.lineageId) ||
      !safeObject(binding.objectId) ||
      !MEDIA_TYPE.test(binding.mediaType) ||
      !SHA256.test(binding.contentSha256) ||
      !Number.isSafeInteger(binding.contentLength) ||
      binding.contentLength < 0 ||
      (binding.payloadClass !== 'RECONSTRUCTABLE_DERIVED_CONTENT' &&
        binding.payloadClass !== 'APPROVED_DERIVED_RESULT') ||
      (binding.dataMode !== 'Hybrid' && binding.dataMode !== 'Cloud') ||
      sourceIds(binding.sourceArtifactVersionIds) === undefined ||
      !PROCESSOR_VERSION.test(binding.processorVersion) ||
      !SHA256.test(binding.sourceLineageHash) ||
      !SHA256.test(binding.executionDescriptorHash) ||
      !SHA256.test(binding.outputPolicyHash)
    )
      return 'CAPABILITY_INVALID';
    if (
      capability.attemptId !== command.attemptId ||
      binding.submissionId !== command.submissionId ||
      binding.executionDescriptorId !== command.executionDescriptorId ||
      binding.objectId !== command.objectId ||
      capability.objectIds.length !== 1 ||
      capability.objectIds[0] !== command.objectId
    )
      return 'OUTPUT_POLICY_MISMATCH';
    if (!(await this.securityEpoch.isCurrent(identity))) return 'SECURITY_EPOCH_REVOKED';
    const verified = await this.verifier.verify(
      {
        capabilityId: capability.capabilityId,
        grantType: capability.grantType,
        tenantScope: capability.tenantScope,
        jobId: capability.jobId,
        attemptId: capability.attemptId,
        workerId: capability.workerId,
        securityEpoch: capability.securityEpoch,
        objectIds: capability.objectIds,
        objectBindings: capability.objectBindings,
        action: capability.action,
        maxBytes: capability.maxBytes,
        issuedAt: capability.issuedAt,
        expiresAt: capability.expiresAt,
        resultFinalizationBinding: binding,
      },
      command.signedCapability,
    );
    return verified ? undefined : 'SIGNED_CAPABILITY_INVALID';
  }
}
