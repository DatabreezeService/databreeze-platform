import type {
  ExecutionAttemptResultV1,
  ExecutionAttemptV1,
} from '@databreeze/domain/execution-attempt/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

/** JRA-007/JRA-023: the worker operation whose authorization must be current. */
export type WorkerOperationV1 =
  | 'CLAIM'
  | 'HEARTBEAT'
  | 'COMPLETE'
  | 'PREPARE_RESULT'
  | 'FINALIZE_RESULT';

export interface WorkerIdentityV1 {
  readonly workerId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  /** Current IAM/device security epoch, resolved from authenticated credentials. */
  readonly securityEpoch: number;
  readonly correlationId: StableIdentifierV1;
}

export interface WorkerAssignmentActionV1 {
  readonly type: string;
  readonly version: number;
  readonly handlerDigest: string;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly requiredCapabilities: readonly string[];
  readonly sideEffectClass: 'NONE' | 'REVERSIBLE' | 'EXTERNAL' | 'DESTRUCTIVE';
  readonly riskClass: 'READ_ONLY' | 'LOW' | 'CONSEQUENTIAL' | 'RESTRICTED';
}

/**
 * JRA-001/JRA-007/JRA-013/JRA-023: one ephemeral assignment returned only after an
 * authenticated, exact-scope PostgreSQL claim. The plaintext lease token is never persisted.
 */
export interface WorkerAssignmentV1 {
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
  readonly expectedRevision: number;
  /** Content-free immutable execution request identity. */
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  /** Canonical hash over descriptorHash + exact attempt/job/worker/epoch/lease expiry. */
  readonly attemptBindingHash: string;
  readonly action: WorkerAssignmentActionV1;
}

export interface WorkerAssignmentPortV1 {
  assign(identity: WorkerIdentityV1, now: string): Promise<WorkerAssignmentV1 | undefined>;
}

export const WORKER_AUTHENTICATOR_PORT = Symbol('WORKER_AUTHENTICATOR_PORT');
export const WORKER_BOUNDARY = Symbol('WORKER_BOUNDARY');
export interface WorkerAuthenticatorPortV1 {
  /** Resolves identity from authenticated server-side credentials; never accepts body scope. */
  authenticate(request: unknown): Promise<WorkerIdentityV1 | undefined>;
}

/** Rechecks the IAM/device epoch at every durable attempt boundary. */
export interface WorkerSecurityEpochPortV1 {
  isCurrent(identity: WorkerIdentityV1): Promise<boolean>;
}

/**
 * A durable, server-owned snapshot used before a worker can receive a grant or commit a
 * completion. The adapter must resolve the exact current attempt, latest-attempt authority,
 * job state, worker revocation/epoch, lease token, revision, and tenant scope in one authority.
 */
export interface WorkerAttemptAuthorizationV1 {
  readonly attempt: ExecutionAttemptV1;
  readonly job: JobV1;
  readonly latestAttemptId: StableIdentifierV1;
  readonly workerSecurityEpoch: number;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
}

export const WORKER_ATTEMPT_AUTHORITY_PORT = Symbol('WORKER_ATTEMPT_AUTHORITY_PORT');
export interface WorkerAttemptAuthorityPortV1 {
  authorize(
    identity: WorkerIdentityV1,
    input: {
      readonly attemptId: StableIdentifierV1;
      readonly leaseTokenHash: string;
      readonly expectedRevision: number;
      readonly operation: WorkerOperationV1;
      readonly now: string;
    },
  ): Promise<WorkerAttemptAuthorizationV1 | undefined>;
}

export interface WorkerInputGrantV1 {
  readonly grantType: 'JOB_INPUT';
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly tenantScope: TenantScopeV1;
  /** Opaque object IDs only. The grant never carries paths, credentials, or commands. */
  readonly objectIds: readonly string[];
  readonly expiresAt: string;
  /** IAE-issued capability metadata; legacy test adapters may omit the extension. */
  readonly capabilityId?: StableIdentifierV1;
  readonly actions?: readonly ['READ'];
  readonly maxBytes?: number;
  readonly issuedAt?: string;
  readonly signedCapability?: string;
}

export interface WorkerOutputGrantV1 {
  readonly grantType: 'JOB_OUTPUT';
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly tenantScope: TenantScopeV1;
  /** One opaque object ID accepted for this attempt. */
  readonly objectId: string;
  readonly expiresAt: string;
  /** IAE-issued capability metadata; legacy test adapters may omit the extension. */
  readonly capabilityId?: StableIdentifierV1;
  readonly action?: 'WRITE';
  readonly maxBytes?: number;
  readonly issuedAt?: string;
  readonly signedCapability?: string;
}

export const WORKER_OBJECT_GRANT_AUTHORITY_PORT = Symbol('WORKER_OBJECT_GRANT_AUTHORITY_PORT');
export interface WorkerObjectGrantAuthorityPortV1 {
  /** Durable authority validates job, attempt, tenant, action, policy, and object ACL. */
  issueInputGrant(
    identity: WorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
  ): Promise<WorkerInputGrantV1>;
  /** Called only by the first successful completion transaction, never by a replay. */
  acceptResultReferences(
    identity: WorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    references: readonly string[],
  ): Promise<readonly WorkerOutputGrantV1[]>;
}

export interface WorkerCompletionV1 {
  readonly attemptId: StableIdentifierV1;
  readonly revision: number;
  readonly outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly resultManifestHash?: string;
  readonly resultReferences: readonly string[];
}

export interface WorkerCompletionTransactionInputV1 {
  readonly identity: WorkerIdentityV1;
  readonly authorization: WorkerAttemptAuthorizationV1;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly resultManifestHash?: string;
  readonly resultReferences: readonly string[];
  readonly fingerprint: string;
  readonly now: string;
}

export type WorkerCompletionTransactionErrorCodeV1 =
  | 'STALE_ATTEMPT'
  | 'LEASE_EXPIRED'
  | 'ATTEMPT_REJECTED'
  | 'OBJECT_GRANT_REJECTED'
  | 'OBJECT_GRANT_UNAVAILABLE'
  | 'COMPLETION_UNAVAILABLE';

export interface WorkerCompletionReplayLookupV1 {
  readonly identity: WorkerIdentityV1;
  readonly attemptId: StableIdentifierV1;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly resultManifestHash?: string;
  readonly resultReferences: readonly string[];
  readonly fingerprint: string;
  readonly now: string;
}

export type WorkerCompletionTransactionResultV1 =
  | {
      readonly accepted: true;
      /** Replays return the stored completion and no output grants. */
      readonly replayed: boolean;
      readonly completion: WorkerCompletionV1;
      readonly outputGrants: readonly WorkerOutputGrantV1[];
    }
  | { readonly accepted: false; readonly code: WorkerCompletionTransactionErrorCodeV1 };

export const WORKER_COMPLETION_TRANSACTION_PORT = Symbol('WORKER_COMPLETION_TRANSACTION_PORT');
export interface WorkerCompletionTransactionPortV1 {
  /**
   * Read-only replay lookup. The durable implementation must validate the exact attempt,
   * lease-token hash, expected revision, job state, latest-attempt authority, worker epoch,
   * tenant scope, and fingerprint before returning a replay. The commit method repeats all of
   * these checks atomically.
   */
  findReplay(input: WorkerCompletionReplayLookupV1): Promise<WorkerCompletionV1 | undefined>;
  /**
   * Atomically rechecks the current attempt and replay key, accepts output grants only for a
   * new completion, commits the attempt/result, and stores the replay record in one durable
   * transaction. A production adapter must provide the database transaction boundary here.
   */
  complete(input: WorkerCompletionTransactionInputV1): Promise<WorkerCompletionTransactionResultV1>;
}

export interface WorkerAttemptMutationPortV1 {
  start(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: string,
    expectedRevision: number,
    securityEpoch?: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>>;
  heartbeat(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: string,
    nextLeaseExpiresAt: string,
    expectedRevision: number,
    securityEpoch?: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>>;
}
