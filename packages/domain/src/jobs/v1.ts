import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-001..JRA-014 and JRA-020..JRA-030: durable typed work vocabulary. */
export const JOB_SCHEMA_VERSION_V1 = 1 as const;

export type JobStateV1 =
  | 'CREATED'
  | 'QUEUED'
  | 'WAITING_FOR_DEVICE'
  | 'DISPATCHED'
  | 'RUNNING'
  | 'NEEDS_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'SUCCEEDED'
  | 'PARTIALLY_SUCCEEDED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED';
export type ActionRiskClassV1 = 'READ_ONLY' | 'LOW' | 'CONSEQUENTIAL' | 'RESTRICTED';
export type ActionSideEffectClassV1 =
  | 'NONE'
  | 'REVERSIBLE'
  | 'EXTERNAL'
  | 'DESTRUCTIVE'
  | 'BILLING_PROVIDER_EFFECT';
export type ApprovalClassV1 = 'NONE' | 'OPTIONAL' | 'REQUIRED';

export interface TypedActionDefinitionV1 {
  readonly schemaVersion: typeof JOB_SCHEMA_VERSION_V1;
  readonly actionType: string;
  readonly version: number;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly requiredCapabilities: readonly string[];
  readonly sideEffectClass: ActionSideEffectClassV1;
  readonly riskClass: ActionRiskClassV1;
  readonly defaultTimeoutSeconds: number;
  readonly maxAttempts: number;
  readonly approvalClass: ApprovalClassV1;
}

export interface JobV1 {
  readonly schemaVersion: typeof JOB_SCHEMA_VERSION_V1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly requestedBy: StableIdentifierV1;
  readonly action: TypedActionDefinitionV1;
  readonly inputManifestHash: string;
  readonly idempotencyKey: string;
  readonly state: JobStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly startedAt?: StrictUtcTimestampV1;
  readonly finishedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export type JobErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_VERSION'
  | 'INVALID_CAPABILITY'
  | 'INVALID_EFFECT'
  | 'INVALID_RISK'
  | 'INVALID_TIMEOUT'
  | 'INVALID_ATTEMPTS'
  | 'INVALID_APPROVAL_CLASS'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'INVALID_TERMINAL_TIMESTAMP';

export type JobResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: JobErrorCodeV1 };

function rejected(code: JobErrorCodeV1): JobResultV1<never> {
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

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

const effects: readonly ActionSideEffectClassV1[] = [
  'NONE',
  'REVERSIBLE',
  'EXTERNAL',
  'DESTRUCTIVE',
  'BILLING_PROVIDER_EFFECT',
];
const risks: readonly ActionRiskClassV1[] = ['READ_ONLY', 'LOW', 'CONSEQUENTIAL', 'RESTRICTED'];
const approvals: readonly ApprovalClassV1[] = ['NONE', 'OPTIONAL', 'REQUIRED'];

export function createTypedActionDefinitionV1(input: {
  readonly actionType: unknown;
  readonly version: unknown;
  readonly inputSchemaId: unknown;
  readonly outputSchemaId: unknown;
  readonly handlerDigest: unknown;
  readonly requiredCapabilities: unknown;
  readonly sideEffectClass: unknown;
  readonly riskClass: unknown;
  readonly defaultTimeoutSeconds: unknown;
  readonly maxAttempts: unknown;
  readonly approvalClass: unknown;
}): JobResultV1<TypedActionDefinitionV1> {
  const actionType = text(input.actionType, 128);
  const inputSchemaId = text(input.inputSchemaId, 128);
  const outputSchemaId = text(input.outputSchemaId, 128);
  const handlerDigest = hash(input.handlerDigest);
  const requiredCapabilities = input.requiredCapabilities;
  if (!actionType || !inputSchemaId || !outputSchemaId || !handlerDigest)
    return rejected(handlerDigest ? 'INVALID_TEXT' : 'INVALID_HASH');
  if (
    !Array.isArray(requiredCapabilities) ||
    requiredCapabilities.length > 64 ||
    requiredCapabilities.some(
      (value) => typeof value !== 'string' || !/^[a-z][a-z0-9_.-]{1,63}$/u.test(value),
    )
  )
    return rejected('INVALID_CAPABILITY');
  if (!effects.includes(input.sideEffectClass as ActionSideEffectClassV1))
    return rejected('INVALID_EFFECT');
  if (!risks.includes(input.riskClass as ActionRiskClassV1)) return rejected('INVALID_RISK');
  if (!approvals.includes(input.approvalClass as ApprovalClassV1))
    return rejected('INVALID_APPROVAL_CLASS');
  if (
    typeof input.version !== 'number' ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1
  )
    return rejected('INVALID_VERSION');
  if (
    typeof input.defaultTimeoutSeconds !== 'number' ||
    !Number.isSafeInteger(input.defaultTimeoutSeconds) ||
    input.defaultTimeoutSeconds < 1 ||
    input.defaultTimeoutSeconds > 86_400
  )
    return rejected('INVALID_TIMEOUT');
  if (
    typeof input.maxAttempts !== 'number' ||
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1 ||
    input.maxAttempts > 20
  )
    return rejected('INVALID_ATTEMPTS');
  if (input.sideEffectClass === 'BILLING_PROVIDER_EFFECT' && input.riskClass !== 'RESTRICTED')
    return rejected('INVALID_RISK');
  if (input.riskClass === 'RESTRICTED' && input.approvalClass !== 'REQUIRED')
    return rejected('INVALID_APPROVAL_CLASS');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: JOB_SCHEMA_VERSION_V1,
      actionType,
      version: input.version,
      inputSchemaId,
      outputSchemaId,
      handlerDigest,
      requiredCapabilities: Object.freeze([...new Set(requiredCapabilities as string[])]),
      sideEffectClass: input.sideEffectClass as ActionSideEffectClassV1,
      riskClass: input.riskClass as ActionRiskClassV1,
      defaultTimeoutSeconds: input.defaultTimeoutSeconds,
      maxAttempts: input.maxAttempts,
      approvalClass: input.approvalClass as ApprovalClassV1,
    }),
  });
}

export function createJobV1(input: {
  readonly jobId: unknown;
  readonly tenantScope: unknown;
  readonly requestedBy: unknown;
  readonly action: TypedActionDefinitionV1;
  readonly inputManifestHash: unknown;
  readonly idempotencyKey: unknown;
  readonly createdAt: unknown;
}): JobResultV1<JobV1> {
  const jobId = stable(input.jobId);
  const tenantScope = scope(input.tenantScope);
  const requestedBy = stable(input.requestedBy);
  const inputManifestHash = hash(input.inputManifestHash);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const createdAt = timestamp(input.createdAt);
  if (!jobId || !requestedBy) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!inputManifestHash) return rejected('INVALID_HASH');
  if (!idempotencyKey) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: JOB_SCHEMA_VERSION_V1,
      jobId,
      tenantScope,
      requestedBy,
      action: input.action,
      inputManifestHash,
      idempotencyKey,
      state: 'CREATED' as const,
      createdAt,
      revision: 1,
    }),
  });
}

const transitions: Readonly<Record<JobStateV1, readonly JobStateV1[]>> = {
  CREATED: ['QUEUED', 'CANCEL_REQUESTED', 'EXPIRED'],
  QUEUED: ['WAITING_FOR_DEVICE', 'DISPATCHED', 'CANCEL_REQUESTED', 'EXPIRED'],
  WAITING_FOR_DEVICE: ['DISPATCHED', 'CANCEL_REQUESTED', 'EXPIRED'],
  DISPATCHED: ['RUNNING', 'CANCEL_REQUESTED', 'EXPIRED'],
  RUNNING: [
    'NEEDS_REVIEW',
    'AWAITING_APPROVAL',
    'SUCCEEDED',
    'PARTIALLY_SUCCEEDED',
    'FAILED',
    'CANCEL_REQUESTED',
  ],
  NEEDS_REVIEW: ['RUNNING', 'AWAITING_APPROVAL', 'CANCEL_REQUESTED', 'EXPIRED'],
  AWAITING_APPROVAL: ['RUNNING', 'SUCCEEDED', 'CANCEL_REQUESTED', 'EXPIRED'],
  SUCCEEDED: [],
  PARTIALLY_SUCCEEDED: [],
  FAILED: ['QUEUED', 'CANCELLED'],
  CANCEL_REQUESTED: ['CANCELLED', 'FAILED'],
  CANCELLED: [],
  EXPIRED: [],
};

export function transitionJobV1(
  job: JobV1,
  nextStateInput: unknown,
  nowInput: unknown,
): JobResultV1<JobV1> {
  const now = timestamp(nowInput);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!Object.hasOwn(transitions, nextStateInput as string)) return rejected('INVALID_STATE');
  const nextState = nextStateInput as JobStateV1;
  if (!transitions[job.state].includes(nextState)) return rejected('INVALID_TRANSITION');
  if (Date.parse(now) < Date.parse(job.createdAt)) return rejected('INVALID_TIMESTAMP');
  const terminal =
    nextState === 'SUCCEEDED' ||
    nextState === 'PARTIALLY_SUCCEEDED' ||
    nextState === 'FAILED' ||
    nextState === 'CANCELLED' ||
    nextState === 'EXPIRED';
  if (terminal && job.finishedAt) return rejected('INVALID_TERMINAL_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...job,
      state: nextState,
      ...(job.startedAt || nextState !== 'RUNNING' ? {} : { startedAt: now }),
      ...(terminal ? { finishedAt: now } : {}),
      revision: job.revision + 1,
    }),
  });
}
