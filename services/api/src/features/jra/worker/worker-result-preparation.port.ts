import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { WorkerAttemptAuthorizationV1, WorkerIdentityV1 } from './worker-ports.js';

export interface WorkerDeclaredOutputV1 {
  readonly kind: 'JSON_RESULT' | 'BINARY_RESULT';
  readonly outputName: string;
  readonly schemaId: string;
  readonly mediaType: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly sourceLineageHash: string;
}

export interface WorkerPreparedOutputPolicyV1 extends WorkerDeclaredOutputV1 {
  readonly objectId: string;
  readonly maxBytes: number;
  readonly allowedMediaTypes: readonly string[];
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly processorVersion: string;
  readonly dataMode: 'Hybrid' | 'Cloud';
  readonly payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' | 'APPROVED_DERIVED_RESULT';
}

export interface WorkerPreparedResultV1 {
  readonly submissionId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
  /** Server-owned opaque BUA binding. Never serialized into worker transport. */
  readonly resultUsageSettlementBindingId: StableIdentifierV1;
  readonly outputPolicyHash: string;
  readonly outputSchemaId: string;
  readonly subjectBindings: Readonly<Record<string, string>>;
  readonly outputs: readonly WorkerPreparedOutputPolicyV1[];
}

export interface WorkerResultWriteCapabilityV1 extends WorkerPreparedOutputPolicyV1 {
  readonly capabilityId: StableIdentifierV1;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signedCapability: string;
}

export interface WorkerPreparedResultResponseV1
  extends Pick<WorkerPreparedResultV1, 'submissionId' | 'attemptId'> {
  readonly schemaVersion: 4;
  readonly accepted: true;
  readonly descriptorBindingHash: string;
  readonly expiresAt: string;
  readonly outputs: readonly {
    readonly outputName: string;
    readonly capabilityId: StableIdentifierV1;
    readonly objectId: string;
    readonly maxBytes: number;
    readonly allowedMediaTypes: readonly string[];
    readonly writeCapability: string;
  }[];
}

export type WorkerResultPreparationResultV1 =
  | {
      readonly accepted: true;
      readonly replayed: boolean;
      readonly preparation: WorkerPreparedResultV1;
    }
  | {
      readonly accepted: false;
      readonly code: 'CONFLICT' | 'STALE_ATTEMPT' | 'PREPARATION_UNAVAILABLE';
    };

export interface WorkerResultPreparationInputV1 {
  readonly identity: WorkerIdentityV1;
  readonly authorization: WorkerAttemptAuthorizationV1;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly outputs: readonly WorkerDeclaredOutputV1[];
  readonly fingerprint: string;
  readonly now: string;
}

export const WORKER_RESULT_PREPARATION_PORT = Symbol('WORKER_RESULT_PREPARATION_PORT');
export interface WorkerResultPreparationPortV1 {
  prepare(input: WorkerResultPreparationInputV1): Promise<WorkerResultPreparationResultV1>;
}

/**
 * JRA-023/JRA-031: root composition adapts this narrow server-owned preparation to IAE.
 * It accepts no worker-selected object policy and returns no URL, path, or storage credential.
 */
export interface WorkerResultWriteCapabilityAuthorityPortV1 {
  issue(
    identity: WorkerIdentityV1,
    preparation: WorkerPreparedResultV1,
    attemptLeaseExpiresAt: string,
  ): Promise<readonly WorkerResultWriteCapabilityV1[]>;
}
export const WORKER_RESULT_WRITE_CAPABILITY_AUTHORITY_PORT = Symbol(
  'WORKER_RESULT_WRITE_CAPABILITY_AUTHORITY_PORT',
);
