import { createHash, randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilitySignerPortV1,
  IaeWorkerIdentityV1,
  IaeWorkerResultFinalizationBindingV1,
  IaeWorkerSecurityEpochPortV1,
} from './worker-object-capability.port.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const OBJECT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;
const MEDIA = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const PROCESSOR = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/u;
const MAX_OUTPUTS = 32;
const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
const MAX_GRANT_MS = 5 * 60 * 1000;

/** Server-owned output authority produced by JRA after current-attempt/descriptor validation. */
export interface IaePreparedWorkerResultOutputAuthorityV1 {
  readonly outputName: string;
  readonly objectId: string;
  readonly mediaType: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly maxBytes: number;
  readonly allowedMediaTypes: readonly string[];
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly sourceLineageHash: string;
  readonly processorVersion: string;
  readonly dataMode: 'Hybrid' | 'Cloud';
  readonly payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' | 'APPROVED_DERIVED_RESULT';
}

export interface IaePreparedWorkerResultAuthorityV1 {
  readonly submissionId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly executionDescriptorId: StableIdentifierV1;
  readonly executionDescriptorHash: string;
  readonly outputPolicyHash: string;
  readonly outputs: readonly IaePreparedWorkerResultOutputAuthorityV1[];
}

export interface IaeWorkerResultWriteCapabilityV1 {
  readonly outputName: string;
  readonly objectId: string;
  readonly maxBytes: number;
  readonly allowedMediaTypes: readonly string[];
  readonly capabilityId: StableIdentifierV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly signedCapability: string;
}

export type IaeWorkerResultWriteCapabilityResultV1 =
  | { readonly accepted: true; readonly value: readonly IaeWorkerResultWriteCapabilityV1[] }
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_SCOPE'
        | 'INVALID_PREPARATION'
        | 'SECURITY_EPOCH_REVOKED'
        | 'CAPABILITY_REPLAY'
        | 'CAPABILITY_UNAVAILABLE';
    };

export const IAE_WORKER_RESULT_WRITE_CAPABILITY_ISSUER_PORT = Symbol(
  'IAE_WORKER_RESULT_WRITE_CAPABILITY_ISSUER_PORT',
);
export interface IaeWorkerResultWriteCapabilityIssuerPortV1 {
  issue(
    identity: IaeWorkerIdentityV1,
    preparation: IaePreparedWorkerResultAuthorityV1,
  ): Promise<IaeWorkerResultWriteCapabilityResultV1>;
}

function stable(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(value: string): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function lineageHash(output: IaePreparedWorkerResultOutputAuthorityV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceArtifactVersionIds: output.sourceArtifactVersionIds,
        processorVersion: output.processorVersion,
      }),
      'utf8',
    )
    .digest('hex');
}

function validOutput(output: IaePreparedWorkerResultOutputAuthorityV1): boolean {
  return (
    /^[a-z][a-z0-9_.-]{0,127}$/u.test(output.outputName) &&
    OBJECT.test(output.objectId) &&
    !output.objectId.includes('..') &&
    MEDIA.test(output.mediaType) &&
    SHA256.test(output.contentSha256) &&
    Number.isSafeInteger(output.byteLength) &&
    output.byteLength >= 0 &&
    Number.isSafeInteger(output.maxBytes) &&
    output.maxBytes > 0 &&
    output.maxBytes <= MAX_OUTPUT_BYTES &&
    output.byteLength <= output.maxBytes &&
    output.allowedMediaTypes.length > 0 &&
    output.allowedMediaTypes.every((value) => MEDIA.test(value)) &&
    output.allowedMediaTypes.includes(output.mediaType) &&
    output.sourceArtifactVersionIds.length > 0 &&
    output.sourceArtifactVersionIds.every((value) => stable(value) !== undefined) &&
    new Set(output.sourceArtifactVersionIds).size === output.sourceArtifactVersionIds.length &&
    PROCESSOR.test(output.processorVersion) &&
    output.sourceLineageHash === lineageHash(output) &&
    (output.dataMode === 'Hybrid' || output.dataMode === 'Cloud') &&
    (output.payloadClass === 'RECONSTRUCTABLE_DERIVED_CONTENT' ||
      output.payloadClass === 'APPROVED_DERIVED_RESULT')
  );
}

function sameBinding(
  existing: IaeWorkerResultFinalizationBindingV1 | undefined,
  preparation: IaePreparedWorkerResultAuthorityV1,
  output: IaePreparedWorkerResultOutputAuthorityV1,
): boolean {
  return (
    existing !== undefined &&
    existing.submissionId === preparation.submissionId &&
    existing.executionDescriptorId === preparation.executionDescriptorId &&
    existing.executionDescriptorHash === preparation.executionDescriptorHash &&
    existing.objectId === output.objectId &&
    existing.mediaType === output.mediaType &&
    existing.contentSha256 === output.contentSha256 &&
    existing.contentLength === output.byteLength &&
    existing.payloadClass === output.payloadClass &&
    existing.dataMode === output.dataMode &&
    JSON.stringify(existing.sourceArtifactVersionIds) ===
      JSON.stringify(output.sourceArtifactVersionIds) &&
    existing.sourceLineageHash === output.sourceLineageHash &&
    existing.outputPolicyHash === preparation.outputPolicyHash &&
    existing.processorVersion === output.processorVersion
  );
}

function rejected(
  code: Exclude<IaeWorkerResultWriteCapabilityResultV1, { readonly accepted: true }>['code'],
): IaeWorkerResultWriteCapabilityResultV1 {
  return Object.freeze({ accepted: false, code });
}

/** IAE-024/JRA-023: mints only descriptor-prepared exact WRITE capabilities. */
export class IaeWorkerResultWriteCapabilityService
  implements IaeWorkerResultWriteCapabilityIssuerPortV1
{
  public constructor(
    private readonly repository: IaeWorkerCapabilityRepositoryPortV1,
    private readonly signer: IaeWorkerCapabilitySignerPortV1,
    private readonly securityEpoch: IaeWorkerSecurityEpochPortV1,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly ids: () => StableIdentifierV1 = () => {
      const parsed = parseStableIdentifierV1(randomUUID());
      if (!parsed.accepted) throw new Error('IAE_WORKER_RESULT_ID_UNAVAILABLE');
      return parsed.value;
    },
  ) {}

  public async issue(
    identity: IaeWorkerIdentityV1,
    preparation: IaePreparedWorkerResultAuthorityV1,
  ): Promise<IaeWorkerResultWriteCapabilityResultV1> {
    if (!tenantScopesEqualV1(identity.tenantScope, preparation.tenantScope))
      return rejected('INVALID_SCOPE');
    const issuedAt = timestamp(this.clock());
    const expiresAt = issuedAt
      ? timestamp(new Date(Date.parse(issuedAt) + MAX_GRANT_MS).toISOString())
      : undefined;
    if (
      !stable(identity.workerId) ||
      !stable(identity.correlationId) ||
      !Number.isSafeInteger(identity.securityEpoch) ||
      identity.securityEpoch < 1 ||
      !stable(preparation.submissionId) ||
      !stable(preparation.attemptId) ||
      !stable(preparation.jobId) ||
      !stable(preparation.executionDescriptorId) ||
      !SHA256.test(preparation.executionDescriptorHash) ||
      !SHA256.test(preparation.outputPolicyHash) ||
      preparation.outputs.length === 0 ||
      preparation.outputs.length > MAX_OUTPUTS ||
      new Set(preparation.outputs.map(({ outputName }) => outputName)).size !==
        preparation.outputs.length ||
      new Set(preparation.outputs.map(({ objectId }) => objectId)).size !==
        preparation.outputs.length ||
      !preparation.outputs.every(validOutput) ||
      !issuedAt ||
      !expiresAt
    )
      return rejected('INVALID_PREPARATION');
    if (!(await this.securityEpoch.isCurrent(identity)))
      return rejected('SECURITY_EPOCH_REVOKED');

    try {
      return await this.repository.withTransaction(identity.tenantScope, async (transaction) => {
        const capabilities: IaeWorkerResultWriteCapabilityV1[] = [];
        for (const output of preparation.outputs) {
          const existing = await transaction.findOutput(
            identity.tenantScope,
            preparation.attemptId,
            output.objectId,
          );
          if (existing !== undefined) {
            if (
              existing.workerId !== identity.workerId ||
              existing.securityEpoch !== identity.securityEpoch ||
              existing.jobId !== preparation.jobId ||
              existing.revokedAt !== undefined ||
              !sameBinding(existing.resultFinalizationBinding, preparation, output)
            )
              return rejected('CAPABILITY_REPLAY');
            const signedCapability = await this.signer.sign({
              capabilityId: existing.capabilityId,
              grantType: existing.grantType,
              tenantScope: existing.tenantScope,
              jobId: existing.jobId,
              attemptId: existing.attemptId,
              workerId: existing.workerId,
              securityEpoch: existing.securityEpoch,
              objectIds: existing.objectIds,
              objectBindings: existing.objectBindings,
              action: existing.action,
              maxBytes: existing.maxBytes,
              issuedAt: existing.issuedAt,
              expiresAt: existing.expiresAt,
              resultFinalizationBinding: existing.resultFinalizationBinding!,
            });
            capabilities.push(
              Object.freeze({
                outputName: output.outputName,
                objectId: output.objectId,
                maxBytes: existing.maxBytes,
                allowedMediaTypes: output.allowedMediaTypes,
                capabilityId: existing.capabilityId,
                issuedAt: existing.issuedAt,
                expiresAt: existing.expiresAt,
                signedCapability,
              }),
            );
            continue;
          }
          const capabilityId = this.ids();
          const binding: IaeWorkerResultFinalizationBindingV1 = Object.freeze({
            submissionId: preparation.submissionId,
            executionDescriptorId: preparation.executionDescriptorId,
            executionDescriptorHash: preparation.executionDescriptorHash,
            artifactId: this.ids(),
            artifactVersionId: this.ids(),
            placementId: this.ids(),
            lineageId: this.ids(),
            objectId: output.objectId,
            mediaType: output.mediaType,
            contentSha256: output.contentSha256,
            contentLength: output.byteLength,
            payloadClass: output.payloadClass,
            dataMode: output.dataMode,
            sourceArtifactVersionIds: Object.freeze([...output.sourceArtifactVersionIds]),
            sourceLineageHash: output.sourceLineageHash,
            outputPolicyHash: preparation.outputPolicyHash,
            processorVersion: output.processorVersion,
          });
          const record: IaeWorkerCapabilityRecordV1 = Object.freeze({
            schemaVersion: 1,
            grantType: 'JOB_OUTPUT',
            capabilityId,
            attemptId: preparation.attemptId,
            jobId: preparation.jobId,
            workerId: identity.workerId,
            securityEpoch: identity.securityEpoch,
            tenantScope: identity.tenantScope,
            objectIds: Object.freeze([output.objectId]),
            objectBindings: Object.freeze([Object.freeze({ objectId: output.objectId })]),
            action: 'WRITE',
            maxBytes: output.maxBytes,
            issuedAt,
            expiresAt,
            resultFinalizationBinding: binding,
          });
          const signedCapability = await this.signer.sign({
            capabilityId,
            grantType: 'JOB_OUTPUT',
            tenantScope: identity.tenantScope,
            jobId: preparation.jobId,
            attemptId: preparation.attemptId,
            workerId: identity.workerId,
            securityEpoch: identity.securityEpoch,
            objectIds: record.objectIds,
            objectBindings: record.objectBindings,
            action: 'WRITE',
            maxBytes: output.maxBytes,
            issuedAt,
            expiresAt,
            resultFinalizationBinding: binding,
          });
          if (!signedCapability || signedCapability.length > 4096)
            return rejected('CAPABILITY_UNAVAILABLE');
          await transaction.save(record);
          capabilities.push(
            Object.freeze({
              outputName: output.outputName,
              objectId: output.objectId,
              maxBytes: output.maxBytes,
              allowedMediaTypes: Object.freeze([...output.allowedMediaTypes]),
              capabilityId,
              issuedAt,
              expiresAt,
              signedCapability,
            }),
          );
        }
        return Object.freeze({ accepted: true, value: Object.freeze(capabilities) });
      });
    } catch {
      return rejected('CAPABILITY_UNAVAILABLE');
    }
  }
}
