import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAE-015: unlock requests contain state only; secret material never enters this contract. */
export const PROTECTED_DOCUMENT_SCHEMA_VERSION_V1 = 1 as const;

export type ProtectedDocumentUnlockModeV1 = 'LOCAL_SECRET_INPUT' | 'DEVICE_KEYCHAIN';
export type ProtectedDocumentUnlockStateV1 = 'REQUESTED' | 'UNLOCKED' | 'FAILED' | 'EXPIRED';
export type ProtectedDocumentUnlockFailureCodeV1 =
  | 'UNLOCK_REJECTED'
  | 'LOCAL_DEVICE_UNAVAILABLE'
  | 'UNSUPPORTED_DOCUMENT'
  | 'MAX_ATTEMPTS';

export interface ProtectedDocumentUnlockRequestV1 {
  readonly schemaVersion: typeof PROTECTED_DOCUMENT_SCHEMA_VERSION_V1;
  readonly requestId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly deviceId?: StableIdentifierV1;
  readonly mode: ProtectedDocumentUnlockModeV1;
  readonly state: ProtectedDocumentUnlockStateV1;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastFailureCode?: ProtectedDocumentUnlockFailureCodeV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export type ProtectedDocumentUnlockResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ProtectedDocumentUnlockErrorCodeV1 };

export type ProtectedDocumentUnlockErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_MODE'
  | 'INVALID_ATTEMPTS'
  | 'INVALID_OUTCOME'
  | 'INVALID_FAILURE_CODE'
  | 'INVALID_STATE'
  | 'REVISION_CONFLICT'
  | 'EXPIRED'
  | 'MAX_ATTEMPTS';

const modes = new Set<ProtectedDocumentUnlockModeV1>(['LOCAL_SECRET_INPUT', 'DEVICE_KEYCHAIN']);
const failureCodes = new Set<ProtectedDocumentUnlockFailureCodeV1>([
  'UNLOCK_REJECTED',
  'LOCAL_DEVICE_UNAVAILABLE',
  'UNSUPPORTED_DOCUMENT',
  'MAX_ATTEMPTS',
]);

function accepted<TValue>(value: TValue): ProtectedDocumentUnlockResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(
  code: ProtectedDocumentUnlockErrorCodeV1,
): ProtectedDocumentUnlockResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function mode(input: unknown): ProtectedDocumentUnlockModeV1 | undefined {
  return typeof input === 'string' && modes.has(input as ProtectedDocumentUnlockModeV1)
    ? (input as ProtectedDocumentUnlockModeV1)
    : undefined;
}

function failureCode(input: unknown): ProtectedDocumentUnlockFailureCodeV1 | undefined {
  return typeof input === 'string' &&
    failureCodes.has(input as ProtectedDocumentUnlockFailureCodeV1)
    ? (input as ProtectedDocumentUnlockFailureCodeV1)
    : undefined;
}

function revision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input > 0 ? input : undefined;
}

function attempts(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 && input <= 10
    ? input
    : undefined;
}

export function createProtectedDocumentUnlockRequestV1(input: {
  readonly requestId: unknown;
  readonly artifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly deviceId?: unknown;
  readonly mode: unknown;
  readonly maxAttempts?: unknown;
  readonly createdAt: unknown;
  readonly expiresAt: unknown;
}): ProtectedDocumentUnlockResultV1<ProtectedDocumentUnlockRequestV1> {
  const requestId = identifier(input.requestId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const deviceId = input.deviceId === undefined ? undefined : identifier(input.deviceId);
  const modeValue = mode(input.mode);
  const maxAttempts = input.maxAttempts === undefined ? 3 : attempts(input.maxAttempts);
  const createdAt = timestamp(input.createdAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!requestId || !artifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (input.deviceId !== undefined && !deviceId) return rejected('INVALID_IDENTIFIER');
  if (!modeValue) return rejected('INVALID_MODE');
  if (!maxAttempts) return rejected('INVALID_ATTEMPTS');
  if (!createdAt || !expiresAt || Date.parse(expiresAt) <= Date.parse(createdAt))
    return rejected('INVALID_TIMESTAMP');
  if (Date.parse(expiresAt) - Date.parse(createdAt) > 24 * 60 * 60 * 1000)
    return rejected('INVALID_TIMESTAMP');
  if (modeValue === 'DEVICE_KEYCHAIN' && !deviceId) return rejected('INVALID_IDENTIFIER');
  return accepted(
    Object.freeze({
      schemaVersion: PROTECTED_DOCUMENT_SCHEMA_VERSION_V1,
      requestId,
      artifactVersionId,
      tenantScope: tenantScope.value,
      ...(deviceId === undefined ? {} : { deviceId }),
      mode: modeValue,
      state: 'REQUESTED' as const,
      attemptCount: 0,
      maxAttempts,
      createdAt,
      expiresAt,
      revision: 1,
    }),
  );
}

export function recordProtectedDocumentUnlockResultV1(
  request: ProtectedDocumentUnlockRequestV1,
  input: {
    readonly expectedRevision: unknown;
    readonly outcome: unknown;
    readonly failureCode?: unknown;
    readonly occurredAt: unknown;
  },
): ProtectedDocumentUnlockResultV1<ProtectedDocumentUnlockRequestV1> {
  if (request.state !== 'REQUESTED') return rejected('INVALID_STATE');
  const expectedRevision = revision(input.expectedRevision);
  if (expectedRevision !== request.revision) return rejected('REVISION_CONFLICT');
  const occurredAt = timestamp(input.occurredAt);
  if (!occurredAt) return rejected('INVALID_TIMESTAMP');
  if (Date.parse(occurredAt) >= Date.parse(request.expiresAt)) return rejected('EXPIRED');
  if (input.outcome !== 'UNLOCKED' && input.outcome !== 'FAILED')
    return rejected('INVALID_OUTCOME');
  const nextAttemptCount = request.attemptCount + 1;
  if (nextAttemptCount > request.maxAttempts) return rejected('MAX_ATTEMPTS');
  if (input.outcome === 'UNLOCKED')
    return accepted(
      Object.freeze({
        ...request,
        state: 'UNLOCKED' as const,
        attemptCount: nextAttemptCount,
        revision: request.revision + 1,
      }),
    );
  const code = input.failureCode === undefined ? 'UNLOCK_REJECTED' : failureCode(input.failureCode);
  if (!code) return rejected('INVALID_FAILURE_CODE');
  return accepted(
    Object.freeze({
      ...request,
      state: nextAttemptCount >= request.maxAttempts ? ('FAILED' as const) : ('REQUESTED' as const),
      attemptCount: nextAttemptCount,
      lastFailureCode: code,
      revision: request.revision + 1,
    }),
  );
}

export function expireProtectedDocumentUnlockRequestV1(
  request: ProtectedDocumentUnlockRequestV1,
  now: unknown,
): ProtectedDocumentUnlockResultV1<ProtectedDocumentUnlockRequestV1> {
  const timestampValue = timestamp(now);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  if (request.state !== 'REQUESTED') return rejected('INVALID_STATE');
  if (Date.parse(timestampValue) < Date.parse(request.expiresAt)) return rejected('EXPIRED');
  return accepted(
    Object.freeze({ ...request, state: 'EXPIRED' as const, revision: request.revision + 1 }),
  );
}
