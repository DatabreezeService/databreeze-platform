import { isFreshStepUpV1, type StepUpAssertionV1, type IdentityResultV1 } from '../identity/v1.js';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '../tenant-scope/v1.js';

/** IAM-012..IAM-018: MFA factors, step-up, and one-time recovery invariants. */
export const MFA_SCHEMA_VERSION_V1 = 1 as const;

export type MfaMethodV1 = 'TOTP' | 'WEBAUTHN';
export type MfaFactorStatusV1 = 'PENDING' | 'ACTIVE' | 'REVOKED';
export type RecoveryCodeStatusV1 = 'AVAILABLE' | 'USED' | 'REVOKED';
export type StepUpRiskV1 = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface MfaFactorV1 {
  readonly schemaVersion: typeof MFA_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly method: MfaMethodV1;
  readonly secretReference: string;
  readonly status: MfaFactorStatusV1;
  readonly enrolledAt: StrictUtcTimestampV1;
  readonly verifiedAt?: StrictUtcTimestampV1;
  readonly revokedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface RecoveryCodeV1 {
  readonly id: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly digest: string;
  readonly status: RecoveryCodeStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly usedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface MfaStateV1 {
  readonly factors: readonly MfaFactorV1[];
  readonly recoveryCodes: readonly RecoveryCodeV1[];
}

export interface RecoveryCodeMatcherV1 {
  matches(presentedDigest: string, storedDigest: string): boolean;
}

export type MfaErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_METHOD'
  | 'INVALID_STATE'
  | 'INVALID_REVISION'
  | 'FACTOR_NOT_ACTIVE'
  | 'RECOVERY_CODE_INVALID'
  | 'RECOVERY_CODE_USED'
  | 'STEP_UP_REQUIRED';

export type MfaResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: MfaErrorCodeV1 };

function rejected(code: MfaErrorCodeV1): MfaResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

export function createMfaFactorV1(input: {
  readonly id: unknown;
  readonly userId: unknown;
  readonly method: unknown;
  readonly secretReference: unknown;
  readonly enrolledAt: unknown;
  readonly revision?: unknown;
}): MfaResultV1<MfaFactorV1> {
  const id = stableId(input.id);
  const userId = stableId(input.userId);
  const method = input.method;
  const secretReference = text(input.secretReference, 512);
  const enrolledAt = timestamp(input.enrolledAt);
  const revision = input.revision === undefined ? 1 : positiveInteger(input.revision);
  if (!id || !userId) return rejected('INVALID_IDENTIFIER');
  if (method !== 'TOTP' && method !== 'WEBAUTHN') return rejected('INVALID_METHOD');
  if (!secretReference) return rejected('INVALID_TEXT');
  if (!enrolledAt) return rejected('INVALID_TIMESTAMP');
  if (!revision) return rejected('INVALID_REVISION');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: MFA_SCHEMA_VERSION_V1,
      id,
      userId,
      method,
      secretReference,
      status: 'PENDING' as const,
      enrolledAt,
      revision,
    }),
  });
}

export function transitionMfaFactorV1(
  factor: MfaFactorV1,
  transition: 'VERIFY' | 'REVOKE',
  at: unknown,
): MfaResultV1<MfaFactorV1> {
  const timestampValue = timestamp(at);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  if (transition === 'VERIFY' && factor.status !== 'PENDING') return rejected('INVALID_STATE');
  if (transition === 'REVOKE' && factor.status === 'REVOKED') return rejected('INVALID_STATE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...factor,
      status: transition === 'VERIFY' ? ('ACTIVE' as const) : ('REVOKED' as const),
      ...(transition === 'VERIFY' ? { verifiedAt: timestampValue } : { revokedAt: timestampValue }),
      revision: factor.revision + 1,
    }),
  });
}

export function createRecoveryCodeV1(input: {
  readonly id: unknown;
  readonly userId: unknown;
  readonly digest: unknown;
  readonly createdAt: unknown;
  readonly revision?: unknown;
}): MfaResultV1<RecoveryCodeV1> {
  const id = stableId(input.id);
  const userId = stableId(input.userId);
  const digest = text(input.digest, 256);
  const createdAt = timestamp(input.createdAt);
  const revision = input.revision === undefined ? 1 : positiveInteger(input.revision);
  if (!id || !userId) return rejected('INVALID_IDENTIFIER');
  if (!digest) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!revision) return rejected('INVALID_REVISION');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      id,
      userId,
      digest,
      status: 'AVAILABLE' as const,
      createdAt,
      revision,
    }),
  });
}

export function redeemRecoveryCodeV1(
  state: MfaStateV1,
  input: { readonly userId: unknown; readonly presentedDigest: unknown; readonly at: unknown },
  matcher: RecoveryCodeMatcherV1,
): MfaResultV1<MfaStateV1> {
  const userId = stableId(input.userId);
  const presentedDigest = text(input.presentedDigest, 256);
  const at = timestamp(input.at);
  if (!userId) return rejected('INVALID_IDENTIFIER');
  if (!presentedDigest) return rejected('RECOVERY_CODE_INVALID');
  if (!at) return rejected('INVALID_TIMESTAMP');
  const candidate = state.recoveryCodes.find(
    (code) =>
      code.userId === userId &&
      code.status === 'AVAILABLE' &&
      matcher.matches(presentedDigest, code.digest),
  );
  if (!candidate) {
    const used = state.recoveryCodes.some(
      (code) => code.userId === userId && matcher.matches(presentedDigest, code.digest),
    );
    return rejected(used ? 'RECOVERY_CODE_USED' : 'RECOVERY_CODE_INVALID');
  }
  const updated = Object.freeze({
    ...candidate,
    status: 'USED' as const,
    usedAt: at,
    revision: candidate.revision + 1,
  });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      factors: state.factors,
      recoveryCodes: Object.freeze(
        state.recoveryCodes.map((code) => (code.id === candidate.id ? updated : code)),
      ),
    }),
  });
}

export function requiresStepUpV1(
  risk: unknown,
  assertion: StepUpAssertionV1 | undefined,
  principalId: StableIdentifierV1,
  now: unknown,
): MfaResultV1<true> {
  if (risk !== 'NORMAL' && risk !== 'HIGH' && risk !== 'CRITICAL') return rejected('INVALID_STATE');
  if (risk === 'NORMAL') return Object.freeze({ accepted: true, value: true });
  if (assertion && isFreshStepUpV1(assertion, principalId, now))
    return Object.freeze({ accepted: true, value: true });
  return rejected('STEP_UP_REQUIRED');
}

export function hasActiveMfaFactorV1(
  state: MfaStateV1,
  userId: StableIdentifierV1,
): IdentityResultV1<boolean> {
  return Object.freeze({
    accepted: true,
    value: state.factors.some((factor) => factor.userId === userId && factor.status === 'ACTIVE'),
  });
}
