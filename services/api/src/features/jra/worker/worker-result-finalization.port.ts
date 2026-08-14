import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type {
  IaeWorkerResultAttestationResolverPortV1,
  IaeWorkerResultFinalizationAttestationV1,
} from '../../iae/application/worker-result-finalization.port.js';

import type {
  WorkerAttemptAuthorizationV1,
  WorkerIdentityV1,
} from './worker-ports.js';

export type WorkerResolvedResultAttestationV1 = IaeWorkerResultFinalizationAttestationV1;
export type WorkerResultAttestationResolverPortV1 = IaeWorkerResultAttestationResolverPortV1;
export const WORKER_RESULT_ATTESTATION_RESOLVER_PORT = Symbol(
  'WORKER_RESULT_ATTESTATION_RESOLVER_PORT',
);

export type WorkerResultEvidenceCoverageV1 = 'COMPLETE' | 'PARTIAL' | 'NONE';
export type WorkerResultApprovalStateV1 = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WorkerCanonicalResultBindingV1 {
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly engineVersion: string;
  readonly evidenceCoverage: WorkerResultEvidenceCoverageV1;
  readonly approvalState: WorkerResultApprovalStateV1;
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly sourceLineageHash: string;
  readonly subjectBindings: Readonly<Record<string, string>>;
}

export interface WorkerResultBindingEchoV1 {
  readonly kind: 'OUTPUT_SET';
  readonly outputSchemaId: string;
  readonly outputNames: readonly string[];
}

export interface WorkerResultAttestationReferenceV1 {
  readonly outputName: string;
  readonly attestationId: StableIdentifierV1;
}

export interface WorkerResultCompletionV1 {
  readonly submissionId: StableIdentifierV1;
  readonly resultManifestId: StableIdentifierV1;
  readonly resultManifestHash: string;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly outcome: 'SUCCEEDED';
  readonly attemptRevision: number;
  readonly jobRevision: number;
  readonly artifactVersionIds: readonly StableIdentifierV1[];
}

export interface WorkerResultFinalizationReplayInputV1 {
  readonly identity: WorkerIdentityV1;
  readonly submissionId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly fingerprint: string;
}

export interface WorkerResultFinalizationInputV1 extends WorkerResultFinalizationReplayInputV1 {
  readonly authorization: WorkerAttemptAuthorizationV1;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
  readonly idempotencyKey: string;
  readonly attestationReferences: readonly WorkerResultAttestationReferenceV1[];
  readonly attestations: readonly WorkerResolvedResultAttestationV1[];
  readonly resultBinding: WorkerResultBindingEchoV1;
  readonly now: string;
}

export type WorkerResultFinalizationResultV1 =
  | {
      readonly accepted: true;
      readonly replayed: boolean;
      readonly completion: WorkerResultCompletionV1;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'CONFLICT'
        | 'STALE_ATTEMPT'
        | 'ATTESTATION_REJECTED'
        | 'FINALIZATION_UNAVAILABLE';
    };

export const WORKER_RESULT_FINALIZATION_PORT = Symbol('WORKER_RESULT_FINALIZATION_PORT');
export interface WorkerResultFinalizationPortV1 {
  findResultReplay(input: WorkerResultFinalizationReplayInputV1): Promise<WorkerResultCompletionV1 | undefined>;
  finalize(input: WorkerResultFinalizationInputV1): Promise<WorkerResultFinalizationResultV1>;
}

export interface WorkerVerifiedResultAttestationV1 {
  readonly attestationId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly contentLength: number;
  readonly mediaType: string;
}

/** Content-free public JRA read model. Consumers still need IAE authorization to open bytes. */
export interface WorkerVerifiedResultManifestV1 {
  readonly resultManifestId: StableIdentifierV1;
  readonly resultManifestHash: string;
  readonly jobId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly outputSchemaId: string;
  readonly engineVersion: string;
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly sourceLineageHash: string;
  readonly subjectBindings: Readonly<Record<string, string>>;
  readonly attestations: readonly WorkerVerifiedResultAttestationV1[];
  readonly finalizedAt: StrictUtcTimestampV1;
}

export const WORKER_VERIFIED_RESULT_MANIFEST_PORT = Symbol('WORKER_VERIFIED_RESULT_MANIFEST_PORT');
export interface WorkerVerifiedResultManifestPortV1 {
  findVerified(input: {
    readonly tenantScope: TenantScopeV1;
    readonly resultManifestId: StableIdentifierV1;
  }): Promise<WorkerVerifiedResultManifestV1 | undefined>;
}

export interface WorkerResultFinalizeResponseV1 {
  readonly schemaVersion: 4;
  readonly accepted: true;
  readonly submissionId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly resultManifestId: StableIdentifierV1;
  readonly resultManifestHash: string;
  readonly outcome: 'SUCCEEDED';
  readonly revision: number;
}
