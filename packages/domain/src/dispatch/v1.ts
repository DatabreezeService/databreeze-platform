import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-001, JRA-002, and JRA-013: PostgreSQL-authoritative dispatch outbox vocabulary. */
export const DISPATCH_SCHEMA_VERSION_V1 = 1 as const;

export type JobDispatchEventTypeV1 =
  | 'JOB_CREATED'
  | 'JOB_READY'
  | 'JOB_CANCEL_REQUESTED'
  | 'JOB_RETRY';

export interface JobDispatchRecordV1 {
  readonly schemaVersion: typeof DISPATCH_SCHEMA_VERSION_V1;
  readonly dispatchId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly eventType: JobDispatchEventTypeV1;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly createdAt: StrictUtcTimestampV1;
  readonly deliveredAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export type DispatchResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DispatchErrorCodeV1 };

export type DispatchErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_EVENT'
  | 'INVALID_HASH'
  | 'INVALID_TEXT'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_REVISION'
  | 'ALREADY_DELIVERED';

function rejected<TValue>(code: DispatchErrorCodeV1): DispatchResultV1<TValue> {
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

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

export function createJobDispatchRecordV1(input: {
  readonly dispatchId: unknown;
  readonly jobId: unknown;
  readonly tenantScope: unknown;
  readonly eventType: unknown;
  readonly payloadHash: unknown;
  readonly idempotencyKey: unknown;
  readonly createdAt: unknown;
}): DispatchResultV1<JobDispatchRecordV1> {
  const dispatchId = stable(input.dispatchId);
  const jobId = stable(input.jobId);
  const tenantScope = scope(input.tenantScope);
  const payloadHash = hash(input.payloadHash);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const createdAt = timestamp(input.createdAt);
  if (!dispatchId || !jobId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!payloadHash) return rejected('INVALID_HASH');
  if (!idempotencyKey) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (
    input.eventType !== 'JOB_CREATED' &&
    input.eventType !== 'JOB_READY' &&
    input.eventType !== 'JOB_CANCEL_REQUESTED' &&
    input.eventType !== 'JOB_RETRY'
  )
    return rejected('INVALID_EVENT');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DISPATCH_SCHEMA_VERSION_V1,
      dispatchId,
      jobId,
      tenantScope,
      eventType: input.eventType as JobDispatchEventTypeV1,
      payloadHash,
      idempotencyKey,
      createdAt,
      revision: 1,
    }),
  });
}

export function markJobDispatchDeliveredV1(
  record: JobDispatchRecordV1,
  deliveredAtInput: unknown,
): DispatchResultV1<JobDispatchRecordV1> {
  if (record.deliveredAt) return rejected('ALREADY_DELIVERED');
  const deliveredAt = timestamp(deliveredAtInput);
  if (!deliveredAt) return rejected('INVALID_TIMESTAMP');
  if (Date.parse(deliveredAt) < Date.parse(record.createdAt)) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...record, deliveredAt, revision: record.revision + 1 }),
  });
}
