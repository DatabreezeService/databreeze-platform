import type { JobV1 } from '@databreeze/domain/jobs/v1';
import { type ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

/** JRA-006/JRA-023: IAE-owned worker capability records contain references only, never bytes. */
export interface IaeWorkerIdentityV1 {
  readonly workerId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly securityEpoch: number;
  readonly correlationId: StableIdentifierV1;
}

export interface IaeWorkerCapabilityObjectBindingV1 {
  readonly objectId: string;
  /** Required for READ grants; omitted until a WRITE has been verified. */
  readonly contentSha256?: string;
  /** Required for READ grants; omitted until a WRITE has been verified. */
  readonly contentLength?: number;
}

export interface IaeWorkerObjectTransferReceiptV1 {
  readonly objectId: string;
  readonly contentSha256: string;
  readonly contentLength: number;
  readonly transferredAt: StrictUtcTimestampV1;
}

/** IAE-024: server-prepared immutable output policy bound into the signed WRITE capability. */
export interface IaeWorkerResultFinalizationBindingV1 {
  readonly submissionId: StableIdentifierV1;
  readonly executionDescriptorId: StableIdentifierV1;
  readonly executionDescriptorHash: string;
  readonly artifactId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly placementId: StableIdentifierV1;
  readonly lineageId: StableIdentifierV1;
  readonly objectId: string;
  readonly mediaType: string;
  readonly contentSha256: string;
  readonly contentLength: number;
  readonly payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' | 'APPROVED_DERIVED_RESULT';
  readonly dataMode: 'Hybrid' | 'Cloud';
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly sourceLineageHash: string;
  readonly outputPolicyHash: string;
  readonly processorVersion: string;
}

export function parseIaeWorkerResultFinalizationBindingV1(
  input: unknown,
): IaeWorkerResultFinalizationBindingV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const row = input as Readonly<Record<string, unknown>>;
  const identifier = (value: unknown) => {
    const parsed = parseStableIdentifierV1(value);
    return parsed.accepted ? parsed.value : undefined;
  };
  const sourceIds = Array.isArray(row['sourceArtifactVersionIds'])
    ? row['sourceArtifactVersionIds'].map(identifier)
    : [];
  const values = {
    submissionId: identifier(row['submissionId']),
    executionDescriptorId: identifier(row['executionDescriptorId']),
    artifactId: identifier(row['artifactId']),
    artifactVersionId: identifier(row['artifactVersionId']),
    placementId: identifier(row['placementId']),
    lineageId: identifier(row['lineageId']),
  };
  if (
    Object.values(values).some((value) => value === undefined) ||
    sourceIds.length === 0 ||
    sourceIds.some((value) => value === undefined) ||
    new Set(sourceIds).size !== sourceIds.length ||
    typeof row['executionDescriptorHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row['executionDescriptorHash']) ||
    typeof row['objectId'] !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u.test(row['objectId']) ||
    row['objectId'].includes('..') ||
    typeof row['mediaType'] !== 'string' ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u.test(
      row['mediaType'],
    ) ||
    typeof row['contentSha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row['contentSha256']) ||
    typeof row['contentLength'] !== 'number' ||
    !Number.isSafeInteger(row['contentLength']) ||
    row['contentLength'] < 0 ||
    (row['payloadClass'] !== 'RECONSTRUCTABLE_DERIVED_CONTENT' &&
      row['payloadClass'] !== 'APPROVED_DERIVED_RESULT') ||
    (row['dataMode'] !== 'Hybrid' && row['dataMode'] !== 'Cloud') ||
    typeof row['sourceLineageHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row['sourceLineageHash']) ||
    typeof row['outputPolicyHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row['outputPolicyHash']) ||
    typeof row['processorVersion'] !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/u.test(row['processorVersion'])
  )
    return undefined;
  return Object.freeze({
    submissionId: values.submissionId!,
    executionDescriptorId: values.executionDescriptorId!,
    executionDescriptorHash: row['executionDescriptorHash'],
    artifactId: values.artifactId!,
    artifactVersionId: values.artifactVersionId!,
    placementId: values.placementId!,
    lineageId: values.lineageId!,
    objectId: row['objectId'],
    mediaType: row['mediaType'],
    contentSha256: row['contentSha256'],
    contentLength: row['contentLength'],
    payloadClass: row['payloadClass'],
    dataMode: row['dataMode'],
    sourceArtifactVersionIds: Object.freeze(sourceIds as StableIdentifierV1[]),
    sourceLineageHash: row['sourceLineageHash'],
    outputPolicyHash: row['outputPolicyHash'],
    processorVersion: row['processorVersion'],
  });
}

export interface IaeWorkerInputObjectGrantV1 {
  readonly schemaVersion: 1;
  readonly grantType: 'JOB_INPUT';
  readonly capabilityId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly tenantScope: TenantScopeV1;
  readonly objectIds: readonly string[];
  readonly actions: readonly ['READ'];
  readonly maxBytes: number;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  /** Opaque signed capability, not a URL, path, credential, or command. */
  readonly signedCapability: string;
}

export interface IaeWorkerResultAcceptanceCapabilityV1 {
  readonly schemaVersion: 1;
  readonly grantType: 'JOB_OUTPUT';
  readonly capabilityId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly tenantScope: TenantScopeV1;
  readonly objectId: string;
  readonly action: 'WRITE';
  readonly maxBytes: number;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly signedCapability: string;
}

export type IaeWorkerCapabilityRecordV1 = {
  readonly schemaVersion: 1;
  readonly grantType: 'JOB_INPUT' | 'JOB_OUTPUT';
  readonly capabilityId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly tenantScope: TenantScopeV1;
  readonly objectIds: readonly string[];
  readonly objectBindings: readonly IaeWorkerCapabilityObjectBindingV1[];
  readonly action: 'READ' | 'WRITE';
  readonly maxBytes: number;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly revokedAt?: StrictUtcTimestampV1;
  readonly transferReceipt?: IaeWorkerObjectTransferReceiptV1;
  readonly resultFinalizationBinding?: IaeWorkerResultFinalizationBindingV1;
};

export interface IaeWorkerCapabilityTransactionPortV1 {
  findInput(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined>;
  findOutput(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
    objectId: string,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined>;
  findByCapability(
    tenantScope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined>;
  save(record: IaeWorkerCapabilityRecordV1): Promise<void>;
  recordTransferReceipt(
    tenantScope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
    receipt: IaeWorkerObjectTransferReceiptV1,
  ): Promise<'RECORDED' | 'REPLAYED' | 'CONFLICT' | 'NOT_FOUND'>;
}

export const IAE_WORKER_CAPABILITY_REPOSITORY_PORT = Symbol(
  'IAE_WORKER_CAPABILITY_REPOSITORY_PORT',
);
export interface IaeWorkerCapabilityRepositoryPortV1 extends IaeWorkerCapabilityTransactionPortV1 {
  withTransaction<TValue>(
    tenantScope: TenantScopeV1,
    work: (transaction: IaeWorkerCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
  revokeForAttempt(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
    revokedAt: StrictUtcTimestampV1,
  ): Promise<void>;
}

export interface IaeWorkerInputObjectResolutionV1 {
  readonly objects: readonly IaeWorkerCapabilityObjectBindingV1[];
  readonly maxBytes: number;
}

export type IaeWorkerInputObjectResolutionResultV1 =
  | { readonly accepted: true; readonly value: IaeWorkerInputObjectResolutionV1 }
  | {
      readonly accepted: false;
      readonly code: 'INPUT_OBJECTS_UNAVAILABLE' | 'INVALID_OBJECT_REFERENCE';
    };

export const IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT = Symbol(
  'IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT',
);
export interface IaeWorkerInputObjectResolverPortV1 {
  resolveInputObjects(input: {
    readonly tenantScope: TenantScopeV1;
    readonly job: JobV1;
    readonly attempt: ExecutionAttemptV1;
    /** Server-owned descriptor references; never accepted from the worker body. */
    readonly inputObjectIds?: readonly string[];
  }): Promise<IaeWorkerInputObjectResolutionResultV1>;
}

export const IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT = Symbol(
  'IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT',
);
export interface IaeWorkerOutputObjectResolverPortV1 {
  isResultObjectAllowed(input: {
    readonly tenantScope: TenantScopeV1;
    readonly job: JobV1;
    readonly attempt: ExecutionAttemptV1;
    readonly objectId: string;
  }): Promise<boolean>;
}

export interface IaeWorkerCapabilitySigningPayloadV1 {
  readonly capabilityId: StableIdentifierV1;
  readonly grantType: 'JOB_INPUT' | 'JOB_OUTPUT';
  readonly tenantScope: TenantScopeV1;
  readonly jobId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly objectIds: readonly string[];
  readonly objectBindings: readonly IaeWorkerCapabilityObjectBindingV1[];
  readonly action: 'READ' | 'WRITE';
  readonly maxBytes: number;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly resultFinalizationBinding?: IaeWorkerResultFinalizationBindingV1;
}

export const IAE_WORKER_CAPABILITY_SIGNER_PORT = Symbol('IAE_WORKER_CAPABILITY_SIGNER_PORT');
export interface IaeWorkerCapabilitySignerPortV1 {
  sign(payload: IaeWorkerCapabilitySigningPayloadV1): Promise<string>;
}

export interface IaeWorkerCapabilityVerifierPortV1 {
  verify(payload: IaeWorkerCapabilitySigningPayloadV1, signedCapability: string): Promise<boolean>;
}
export const IAE_WORKER_CAPABILITY_VERIFIER_PORT = Symbol('IAE_WORKER_CAPABILITY_VERIFIER_PORT');

/** Resolves only the authenticated opaque capability reference; all authority is re-verified. */
export interface IaeWorkerCapabilityReferenceResolverPortV1 {
  resolveCapabilityId(signedCapability: string): Promise<StableIdentifierV1 | undefined>;
}

export const IAE_WORKER_SECURITY_EPOCH_PORT = Symbol('IAE_WORKER_SECURITY_EPOCH_PORT');
export interface IaeWorkerSecurityEpochPortV1 {
  isCurrent(identity: IaeWorkerIdentityV1): Promise<boolean>;
}

export class UnavailableIaeWorkerInputObjectResolverAdapter
  implements IaeWorkerInputObjectResolverPortV1
{
  public resolveInputObjects(
    _input: Parameters<IaeWorkerInputObjectResolverPortV1['resolveInputObjects']>[0],
  ): Promise<IaeWorkerInputObjectResolutionResultV1> {
    void _input;
    return Promise.resolve({ accepted: false, code: 'INPUT_OBJECTS_UNAVAILABLE' });
  }
}

export class UnavailableIaeWorkerOutputObjectResolverAdapter
  implements IaeWorkerOutputObjectResolverPortV1
{
  public isResultObjectAllowed(
    _input: Parameters<IaeWorkerOutputObjectResolverPortV1['isResultObjectAllowed']>[0],
  ): Promise<boolean> {
    void _input;
    return Promise.resolve(false);
  }
}

export class UnavailableIaeWorkerCapabilitySignerAdapter
  implements IaeWorkerCapabilitySignerPortV1
{
  public sign(_payload: IaeWorkerCapabilitySigningPayloadV1): Promise<string> {
    void _payload;
    return Promise.reject(new Error('IAE_WORKER_CAPABILITY_SIGNING_UNAVAILABLE'));
  }
}

export class UnavailableIaeWorkerCapabilityVerifierAdapter
  implements IaeWorkerCapabilityVerifierPortV1
{
  public verify(
    _payload: IaeWorkerCapabilitySigningPayloadV1,
    _signedCapability: string,
  ): Promise<boolean> {
    void _payload;
    void _signedCapability;
    return Promise.resolve(false);
  }
}

export class UnavailableIaeWorkerSecurityEpochAdapter implements IaeWorkerSecurityEpochPortV1 {
  public isCurrent(_identity: IaeWorkerIdentityV1): Promise<boolean> {
    void _identity;
    return Promise.resolve(false);
  }
}
