import {
  consumeRecoveryChallengeV1,
  createRecoveryChallengeV1,
  RECOVERY_CHALLENGE_MAX_SECONDS_V1,
  revokeRecoveryChallengeV1,
} from '@databreeze/domain/recovery/v1';
import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { RecoveryChallengeV1 } from '@databreeze/domain/recovery/v1';

import type { PasswordCredentialService } from './password-credential.service.js';
import type {
  RecoveryCompletionResultV1,
  RecoveryAdmissionPortV1,
  RecoveryDeliveryPortV1,
  RecoveryDigestPortV1,
  RecoveryFailureCodeV1,
  RecoveryLocaleV1,
  RecoveryRepositoryPortV1,
  RecoveryRequestResultV1,
} from './recovery-repository.port.js';

export const IAM_RECOVERY_SERVICE = Symbol('IAM_RECOVERY_SERVICE');

export interface RecoveryIdGeneratorV1 {
  next(): string;
}

export interface RecoveryTokenGeneratorV1 {
  next(): string;
}

export interface RecoveryClockV1 {
  now(): Date;
}

export interface RecoveryServicePortsV1 {
  readonly repository: RecoveryRepositoryPortV1;
  readonly passwordCredentials: PasswordCredentialService;
  readonly digest: RecoveryDigestPortV1;
  readonly delivery: RecoveryDeliveryPortV1;
  readonly ids: RecoveryIdGeneratorV1;
  readonly tokens: RecoveryTokenGeneratorV1;
  readonly clock?: RecoveryClockV1;
  readonly admission?: RecoveryAdmissionPortV1;
  readonly completionAdmission?: RecoveryAdmissionPortV1;
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function rawToken(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length < 32 || input.length > 512) return undefined;
  if (!/^[A-Za-z0-9_-]+$/u.test(input)) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  return input;
}

function recoveryLocale(input: unknown): RecoveryLocaleV1 | undefined {
  if (input === undefined) return 'vi-VN';
  return input === 'en' || input === 'vi-VN' ? input : undefined;
}

function timestamp(clock: RecoveryClockV1 | undefined): string | undefined {
  try {
    const value = clock?.now() ?? new Date();
    return value instanceof Date && Number.isFinite(value.getTime())
      ? value.toISOString()
      : undefined;
  } catch {
    return undefined;
  }
}

function unavailable(): { readonly accepted: false; readonly code: 'RECOVERY_UNAVAILABLE' } {
  return Object.freeze({ accepted: false, code: 'RECOVERY_UNAVAILABLE' as const });
}

function inputRejected(code: RecoveryFailureCodeV1): {
  readonly accepted: false;
  readonly code: RecoveryFailureCodeV1;
} {
  return Object.freeze({ accepted: false, code });
}

/** Public recovery flow: generic requests, hashed single-use tokens, and atomic credential reset. */
export class RecoveryService {
  private readonly compensationBlocked = new Set<string>();

  public constructor(private readonly ports: RecoveryServicePortsV1) {}

  public async request(
    emailInput: unknown,
    localeInput: unknown = 'vi-VN',
  ): Promise<RecoveryRequestResultV1> {
    const normalized = normalizeEmailAddressV1(emailInput);
    if (!normalized.accepted) return inputRejected('INVALID_INPUT');
    const locale = recoveryLocale(localeInput);
    if (!locale) return inputRejected('INVALID_INPUT');
    const issuedAt = timestamp(this.ports.clock);
    if (!issuedAt) return unavailable();
    let challengeId: string;
    let raw: string;
    try {
      challengeId = this.ports.ids.next();
      raw = this.ports.tokens.next();
    } catch {
      return unavailable();
    }
    if (!stable(challengeId) || !rawToken(raw)) return unavailable();
    let tokenDigest: string;
    let emailDigest: string;
    try {
      tokenDigest = this.ports.digest.digestToken(raw);
      emailDigest = this.ports.digest.digestEmail(normalized.value);
    } catch {
      return unavailable();
    }
    if (this.ports.admission) {
      try {
        if (!(await this.ports.admission.allow(emailDigest, issuedAt)))
          return Object.freeze({ accepted: true as const, value: { requested: true as const } });
      } catch {
        return unavailable();
      }
    }
    const expiresAt = new Date(
      Date.parse(issuedAt) + RECOVERY_CHALLENGE_MAX_SECONDS_V1 * 1_000,
    ).toISOString();
    let issued: RecoveryChallengeV1 | undefined;
    try {
      const persisted = await this.ports.repository.withTransaction(async (transaction) => {
        const userId = await transaction.findUserIdByEmail(normalized.value);
        if (!userId) return undefined;
        const active = await transaction.findActiveChallengeForUser(userId);
        const challenge = createRecoveryChallengeV1({
          id: challengeId,
          userId,
          tokenDigest,
          emailDigest,
          issuedAt,
          expiresAt,
        });
        if (!challenge.accepted) throw new Error('IAM_RECOVERY_CHALLENGE_INVALID');
        // Replace the prior bearer atomically so there is never more than one active token.
        if (active) {
          const revoked = revokeRecoveryChallengeV1(active, issuedAt);
          if (!revoked.accepted) throw new Error('IAM_RECOVERY_REVOKE_INVALID');
          await transaction.saveChallenge(revoked.value);
        }
        await transaction.saveChallenge(challenge.value);
        return challenge.value;
      });
      if (!persisted)
        return Object.freeze({ accepted: true as const, value: { requested: true as const } });
      issued = persisted;
    } catch {
      return unavailable();
    }

    try {
      await this.ports.delivery.deliver({
        challengeId: issued.id,
        recipientEmail: normalized.value,
        rawToken: raw,
        expiresAt: issued.expiresAt,
        locale,
      });
    } catch {
      try {
        await this.ports.repository.withTransaction(async (transaction) => {
          const current = await transaction.findChallengeByTokenDigest(issued.tokenDigest);
          if (!current || current.status !== 'ACTIVE') return;
          const revoked = revokeRecoveryChallengeV1(
            current,
            timestamp(this.ports.clock) ?? issuedAt,
          );
          if (!revoked.accepted) throw new Error('IAM_RECOVERY_REVOKE_INVALID');
          await transaction.saveChallenge(revoked.value);
        });
      } catch {
        try {
          await this.ports.repository.withTransaction(async (transaction) => {
            await transaction.recordChallengeCompensationFailure(
              issued.tokenDigest,
              timestamp(this.ports.clock) ?? issuedAt,
            );
          });
        } catch {
          // Keep a process-local fail-closed marker while the durable marker is unavailable.
          this.compensationBlocked.add(issued.tokenDigest);
        }
      }
      return unavailable();
    }

    return Object.freeze({ accepted: true as const, value: { requested: true as const } });
  }

  public async complete(
    rawTokenInput: unknown,
    newPassword: unknown,
  ): Promise<RecoveryCompletionResultV1> {
    const raw = rawToken(rawTokenInput);
    if (!raw) return inputRejected('INVALID_TOKEN');
    let digest: string;
    try {
      digest = this.ports.digest.digestToken(raw);
    } catch {
      return unavailable();
    }
    const now = timestamp(this.ports.clock);
    if (!now) return unavailable();

    if (this.ports.completionAdmission) {
      try {
        if (!(await this.ports.completionAdmission.allow(digest, now)))
          return inputRejected('INVALID_TOKEN');
      } catch {
        return unavailable();
      }
    }

    if (this.compensationBlocked.has(digest)) return inputRejected('INVALID_TOKEN');

    // Resolve and validate the challenge before doing expensive password work. This
    // keeps unknown, expired, and already-consumed tokens cheap and indistinguishable.
    let candidate: ReturnType<typeof consumeRecoveryChallengeV1> | undefined;
    try {
      candidate = await this.ports.repository.withTransaction(async (transaction) => {
        if (await transaction.isChallengeCompensationBlocked(digest)) return undefined;
        const challenge = await transaction.findChallengeByTokenDigest(digest);
        return challenge ? consumeRecoveryChallengeV1(challenge, now) : undefined;
      });
    } catch {
      return unavailable();
    }
    if (!candidate?.accepted) return inputRejected('INVALID_TOKEN');

    const credential = await this.ports.passwordCredentials.create(newPassword);
    if (!credential.accepted) {
      return inputRejected(
        credential.code === 'INVALID_PASSWORD' ? 'INVALID_INPUT' : 'RECOVERY_UNAVAILABLE',
      );
    }

    let credentialId: StableIdentifierV1;
    try {
      const parsedId = stable(this.ports.ids.next());
      if (!parsedId) return unavailable();
      credentialId = parsedId;
    } catch {
      return unavailable();
    }

    try {
      return await this.ports.repository.withTransaction(async (transaction) => {
        const challenge = await transaction.findChallengeByTokenDigest(digest);
        if (!challenge) return inputRejected('INVALID_TOKEN');
        const consumed = consumeRecoveryChallengeV1(challenge, now);
        if (!consumed.accepted) return inputRejected('INVALID_TOKEN');
        await transaction.completeRecovery({
          challenge: consumed.value,
          credentialId,
          credential: credential.value,
        });
        return Object.freeze({
          accepted: true as const,
          value: Object.freeze({
            userId: consumed.value.userId,
            mfaReenrollmentRequired: true as const,
          }),
        });
      });
    } catch {
      return unavailable();
    }
  }
}
