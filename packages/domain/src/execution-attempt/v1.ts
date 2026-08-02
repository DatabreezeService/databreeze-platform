import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-007, JRA-021, and JRA-023: attempt-scoped execution leases. */
export const EXECUTION_ATTEMPT_SCHEMA_VERSION_V1 = 1 as const;

export type ExecutionAttemptStateV1 =
  | 'CLAIMED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';
export type ExecutionExecutorTypeV1 = 'CLOUD_WORKER' | 'DESKTOP_AGENT';
export type ExecutionAttemptOutcomeV1 = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface ExecutionAttemptV1 {
  readonly schemaVersion: typeof EXECUTION_ATTEMPT_SCHEMA_VERSION_V1;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly attemptNumber: number;
  readonly executorType: ExecutionExecutorTypeV1;
  readonly executorId: StableIdentifierV1;
  readonly leaseTokenHash: string;
  readonly leaseExpiresAt: StrictUtcTimestampV1;
  readonly state: ExecutionAttemptStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly heartbeatAt: StrictUtcTimestampV1;
  readonly startedAt?: StrictUtcTimestampV1;
  readonly finishedAt?: StrictUtcTimestampV1;
  readonly resultManifestHash?: string;
  readonly revision: number;
}

export type ExecutionAttemptResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ExecutionAttemptErrorCodeV1 };

export type ExecutionAttemptErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_NUMBER'
  | 'INVALID_EXECUTOR'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_LEASE'
  | 'LEASE_EXPIRED'
  | 'INVALID_STATE'
  | 'INVALID_OUTCOME'
  | 'INVALID_RESULT_HASH'
  | 'INVALID_REVISION';

function rejected<TValue>(code: ExecutionAttemptErrorCodeV1): ExecutionAttemptResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

function after(left: StrictUtcTimestampV1, right: StrictUtcTimestampV1): boolean {
  return Date.parse(left) > Date.parse(right);
}

function notBefore(left: StrictUtcTimestampV1, right: StrictUtcTimestampV1): boolean {
  return Date.parse(left) >= Date.parse(right);
}

function active(attempt: ExecutionAttemptV1): boolean {
  return attempt.state === 'CLAIMED' || attempt.state === 'RUNNING';
}

function leaseMatches(attempt: ExecutionAttemptV1, leaseTokenHash: unknown): boolean {
  return typeof leaseTokenHash === 'string' && leaseTokenHash === attempt.leaseTokenHash;
}

export function createExecutionAttemptV1(input: {
  readonly attemptId: unknown;
  readonly jobId: unknown;
  readonly tenantScope: unknown;
  readonly attemptNumber: unknown;
  readonly executorType: unknown;
  readonly executorId: unknown;
  readonly leaseTokenHash: unknown;
  readonly leaseExpiresAt: unknown;
  readonly createdAt: unknown;
}): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const attemptId = stable(input.attemptId);
  const jobId = stable(input.jobId);
  const tenantScope = scope(input.tenantScope);
  const executorId = stable(input.executorId);
  const leaseTokenHash = hash(input.leaseTokenHash);
  const leaseExpiresAt = timestamp(input.leaseExpiresAt);
  const createdAt = timestamp(input.createdAt);
  if (!attemptId || !jobId || !executorId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!leaseTokenHash) return rejected('INVALID_HASH');
  if (!leaseExpiresAt || !createdAt) return rejected('INVALID_TIMESTAMP');
  if (!after(leaseExpiresAt, createdAt)) return rejected('INVALID_LEASE');
  if (
    typeof input.attemptNumber !== 'number' ||
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    input.attemptNumber > 20
  )
    return rejected('INVALID_NUMBER');
  if (input.executorType !== 'CLOUD_WORKER' && input.executorType !== 'DESKTOP_AGENT')
    return rejected('INVALID_EXECUTOR');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: EXECUTION_ATTEMPT_SCHEMA_VERSION_V1,
      attemptId,
      jobId,
      tenantScope,
      attemptNumber: input.attemptNumber,
      executorType: input.executorType,
      executorId,
      leaseTokenHash,
      leaseExpiresAt,
      state: 'CLAIMED' as const,
      createdAt,
      heartbeatAt: createdAt,
      revision: 1,
    }),
  });
}

export function startExecutionAttemptV1(
  attempt: ExecutionAttemptV1,
  leaseTokenHash: unknown,
  nowInput: unknown,
): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const now = timestamp(nowInput);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!active(attempt)) return rejected('INVALID_STATE');
  if (!leaseMatches(attempt, leaseTokenHash)) return rejected('INVALID_LEASE');
  if (!notBefore(attempt.leaseExpiresAt, now)) return rejected('LEASE_EXPIRED');
  if (attempt.state === 'RUNNING') return Object.freeze({ accepted: true, value: attempt });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...attempt,
      state: 'RUNNING' as const,
      startedAt: now,
      heartbeatAt: now,
      revision: attempt.revision + 1,
    }),
  });
}

export function renewExecutionAttemptLeaseV1(
  attempt: ExecutionAttemptV1,
  leaseTokenHash: unknown,
  nowInput: unknown,
  nextLeaseExpiresAtInput: unknown,
): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const now = timestamp(nowInput);
  const nextLeaseExpiresAt = timestamp(nextLeaseExpiresAtInput);
  if (!now || !nextLeaseExpiresAt) return rejected('INVALID_TIMESTAMP');
  if (!active(attempt)) return rejected('INVALID_STATE');
  if (!leaseMatches(attempt, leaseTokenHash)) return rejected('INVALID_LEASE');
  if (!notBefore(attempt.leaseExpiresAt, now)) return rejected('LEASE_EXPIRED');
  if (!after(nextLeaseExpiresAt, now) || !after(nextLeaseExpiresAt, attempt.leaseExpiresAt))
    return rejected('INVALID_LEASE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...attempt,
      leaseExpiresAt: nextLeaseExpiresAt,
      heartbeatAt: now,
      revision: attempt.revision + 1,
    }),
  });
}

export function completeExecutionAttemptV1(
  attempt: ExecutionAttemptV1,
  leaseTokenHash: unknown,
  outcomeInput: unknown,
  nowInput: unknown,
  resultManifestHashInput?: unknown,
): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const now = timestamp(nowInput);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!active(attempt)) return rejected('INVALID_STATE');
  if (!leaseMatches(attempt, leaseTokenHash)) return rejected('INVALID_LEASE');
  if (!notBefore(attempt.leaseExpiresAt, now)) return rejected('LEASE_EXPIRED');
  if (outcomeInput !== 'SUCCEEDED' && outcomeInput !== 'FAILED' && outcomeInput !== 'CANCELLED')
    return rejected('INVALID_OUTCOME');
  const resultManifestHash =
    resultManifestHashInput === undefined ? undefined : hash(resultManifestHashInput);
  if (resultManifestHashInput !== undefined && !resultManifestHash)
    return rejected('INVALID_RESULT_HASH');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...attempt,
      state: outcomeInput as ExecutionAttemptOutcomeV1,
      finishedAt: now,
      heartbeatAt: now,
      ...(resultManifestHash ? { resultManifestHash } : {}),
      revision: attempt.revision + 1,
    }),
  });
}

export function expireExecutionAttemptV1(
  attempt: ExecutionAttemptV1,
  nowInput: unknown,
): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const now = timestamp(nowInput);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!active(attempt)) return rejected('INVALID_STATE');
  if (notBefore(attempt.leaseExpiresAt, now)) return rejected('INVALID_LEASE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...attempt,
      state: 'EXPIRED' as const,
      finishedAt: now,
      heartbeatAt: now,
      revision: attempt.revision + 1,
    }),
  });
}
