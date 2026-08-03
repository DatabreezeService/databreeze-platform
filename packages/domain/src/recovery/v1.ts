import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '../tenant-scope/v1.js';

/** IAM-015: short-lived recovery bearers are hashed and single-use at rest. */
export const RECOVERY_CHALLENGE_SCHEMA_VERSION_V1 = 1 as const;
export const RECOVERY_CHALLENGE_MAX_SECONDS_V1 = 60 * 60;

export type RecoveryChallengeStatusV1 = 'ACTIVE' | 'CONSUMED' | 'REVOKED';

export interface RecoveryChallengeV1 {
  readonly schemaVersion: typeof RECOVERY_CHALLENGE_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly tokenDigest: string;
  readonly emailDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: RecoveryChallengeStatusV1;
  readonly consumedAt?: string;
  readonly revokedAt?: string;
  readonly revision: number;
}

export type RecoveryChallengeErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_DIGEST'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_LIFETIME'
  | 'INVALID_STATE'
  | 'ALREADY_TERMINAL'
  | 'EXPIRED';

export type RecoveryChallengeResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: RecoveryChallengeErrorCodeV1 };

function accepted<TValue>(value: TValue): RecoveryChallengeResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: RecoveryChallengeErrorCodeV1): RecoveryChallengeResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): string | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function digest(input: unknown): string | undefined {
  return typeof input === 'string' && /^[a-f0-9]{64}$/u.test(input) ? input : undefined;
}

function revision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

export function createRecoveryChallengeV1(input: {
  readonly id: unknown;
  readonly userId: unknown;
  readonly tokenDigest: unknown;
  readonly emailDigest: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
  readonly revision?: unknown;
}): RecoveryChallengeResultV1<RecoveryChallengeV1> {
  const id = stable(input.id);
  const userId = stable(input.userId);
  const tokenDigest = digest(input.tokenDigest);
  const emailDigest = digest(input.emailDigest);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  const currentRevision = input.revision === undefined ? 1 : revision(input.revision);
  if (!id || !userId) return rejected('INVALID_IDENTIFIER');
  if (!tokenDigest || !emailDigest) return rejected('INVALID_DIGEST');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!currentRevision) return rejected('INVALID_STATE');
  const duration = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > RECOVERY_CHALLENGE_MAX_SECONDS_V1 * 1_000
  )
    return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: RECOVERY_CHALLENGE_SCHEMA_VERSION_V1,
      id,
      userId,
      tokenDigest,
      emailDigest,
      issuedAt,
      expiresAt,
      status: 'ACTIVE' as const,
      revision: currentRevision,
    }),
  );
}

export function consumeRecoveryChallengeV1(
  challenge: RecoveryChallengeV1,
  at: unknown,
): RecoveryChallengeResultV1<RecoveryChallengeV1> {
  const current = timestamp(at);
  if (!current) return rejected('INVALID_TIMESTAMP');
  if (challenge.status !== 'ACTIVE') return rejected('ALREADY_TERMINAL');
  const now = Date.parse(current);
  const issued = Date.parse(challenge.issuedAt);
  const expires = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(now) || now < issued) return rejected('INVALID_TIMESTAMP');
  if (now >= expires) return rejected('EXPIRED');
  return accepted(
    Object.freeze({
      ...challenge,
      status: 'CONSUMED' as const,
      consumedAt: current,
      revision: challenge.revision + 1,
    }),
  );
}

export function revokeRecoveryChallengeV1(
  challenge: RecoveryChallengeV1,
  at: unknown,
): RecoveryChallengeResultV1<RecoveryChallengeV1> {
  const current = timestamp(at);
  if (!current) return rejected('INVALID_TIMESTAMP');
  if (challenge.status !== 'ACTIVE') return rejected('ALREADY_TERMINAL');
  return accepted(
    Object.freeze({
      ...challenge,
      status: 'REVOKED' as const,
      revokedAt: current,
      revision: challenge.revision + 1,
    }),
  );
}
