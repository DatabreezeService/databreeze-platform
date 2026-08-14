import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IaeWorkerIdentityV1 } from './worker-object-capability.port.js';

export const IAE_WORKER_RESULT_FINALIZATION_PORT = Symbol('IAE_WORKER_RESULT_FINALIZATION_PORT');

export interface IaeWorkerResultFinalizationCommandV1 {
  readonly submissionId: StableIdentifierV1;
  readonly capabilityId: StableIdentifierV1;
  readonly signedCapability: string;
  readonly attemptId: StableIdentifierV1;
  readonly executionDescriptorId: StableIdentifierV1;
  readonly objectId: string;
  readonly contentSha256: string;
  readonly contentLength: number;
  readonly mediaType: string;
}

/** Content-free authority reference. It intentionally excludes object IDs, locators and tokens. */
export interface IaeWorkerResultFinalizationAttestationV1 {
  readonly schemaVersion: 1;
  readonly attestationId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly jobId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly executionDescriptorId: StableIdentifierV1;
  readonly executionDescriptorHash: string;
  readonly submissionId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly contentLength: number;
  readonly mediaType: string;
  readonly sourceLineageHash: string;
  readonly outputPolicyHash: string;
  readonly finalizedAt: StrictUtcTimestampV1;
}

export type IaeWorkerResultFinalizationErrorCodeV1 =
  | 'INVALID_COMMAND'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_SCOPE'
  | 'CAPABILITY_NOT_FOUND'
  | 'CAPABILITY_INVALID'
  | 'CAPABILITY_EXPIRED'
  | 'ATTEMPT_SUPERSEDED'
  | 'SECURITY_EPOCH_REVOKED'
  | 'SIGNED_CAPABILITY_INVALID'
  | 'TRANSFER_RECEIPT_MISSING'
  | 'TRANSFER_RECEIPT_MISMATCH'
  | 'OUTPUT_POLICY_MISMATCH'
  | 'SOURCE_LINEAGE_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PERSISTENCE_UNAVAILABLE';

export type IaeWorkerResultFinalizationResultV1 =
  | { readonly accepted: true; readonly value: IaeWorkerResultFinalizationAttestationV1 }
  | { readonly accepted: false; readonly code: IaeWorkerResultFinalizationErrorCodeV1 };

export interface IaeWorkerResultFinalizationPortV1 {
  finalize(
    identity: IaeWorkerIdentityV1,
    command: IaeWorkerResultFinalizationCommandV1,
    nowInput?: unknown,
  ): Promise<IaeWorkerResultFinalizationResultV1>;
}

export const IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT = Symbol(
  'IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT',
);

export interface IaeWorkerResultAttestationResolverPortV1 {
  resolveAttestation(input: {
    readonly tenantScope: TenantScopeV1;
    readonly attestationId: StableIdentifierV1;
  }): Promise<IaeWorkerResultFinalizationAttestationV1 | undefined>;
}

export class UnavailableIaeWorkerResultFinalizationAdapter
  implements IaeWorkerResultFinalizationPortV1
{
  public finalize(
    _identity: IaeWorkerIdentityV1,
    _command: IaeWorkerResultFinalizationCommandV1,
  ): Promise<IaeWorkerResultFinalizationResultV1> {
    void _identity;
    void _command;
    return Promise.resolve({ accepted: false, code: 'PERSISTENCE_UNAVAILABLE' });
  }
}

export class UnavailableIaeWorkerResultAttestationResolverAdapter
  implements IaeWorkerResultAttestationResolverPortV1
{
  public resolveAttestation(
    _input: Parameters<IaeWorkerResultAttestationResolverPortV1['resolveAttestation']>[0],
  ): Promise<undefined> {
    void _input;
    return Promise.resolve(undefined);
  }
}
