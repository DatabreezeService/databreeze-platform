import { randomInt, randomUUID } from 'node:crypto';

import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  EmailVerificationChallengeRecordV1,
  EmailVerificationDeliveryPortV1,
  EmailVerificationDigestPortV1,
  EmailVerificationFailureCodeV1,
  EmailVerificationRepositoryPortV1,
  EmailVerificationRequestResultV1,
  EmailVerificationVerifyResultV1,
} from './email-verification-repository.port.js';
import {
  EMAIL_VERIFICATION_EXPIRY_SECONDS_V1,
  EMAIL_VERIFICATION_MAX_ATTEMPTS_V1,
  EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1,
  EMAIL_VERIFICATION_RESEND_SECONDS_V1,
} from './email-verification-repository.port.js';

export const IAM_EMAIL_VERIFICATION_SERVICE = Symbol('IAM_EMAIL_VERIFICATION_SERVICE');

export interface EmailVerificationClockV1 {
  now(): Date;
}

export interface EmailVerificationServicePortsV1 {
  readonly repository: EmailVerificationRepositoryPortV1;
  readonly digest: EmailVerificationDigestPortV1;
  readonly delivery: EmailVerificationDeliveryPortV1;
  readonly clock?: EmailVerificationClockV1;
  readonly ids?: { next(): string };
  readonly codes?: { next(): string };
}

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function rejected(
  code: EmailVerificationFailureCodeV1,
): { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 } {
  return Object.freeze({ accepted: false, code });
}

function sixDigitCode(generator?: { next(): string }): string | undefined {
  try {
    const raw = generator?.next() ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!/^\d{6}$/u.test(raw)) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

function parseCode(input: unknown): string | undefined {
  if (typeof input !== 'string' || !/^\d{6}$/u.test(input)) return undefined;
  return input;
}

/** IAM-022: enumeration-safe email OTP registration with digest-only challenge storage. */
export class EmailVerificationService {
  public constructor(private readonly ports: EmailVerificationServicePortsV1) {}

  public async requestEmailVerification(input: {
    readonly email: unknown;
    readonly passwordProofId?: unknown;
    readonly locale?: unknown;
    readonly correlationId?: unknown;
  }): Promise<EmailVerificationRequestResultV1> {
    const email = normalizeEmailAddressV1(input.email);
    if (!email.accepted) return rejected('INVALID_INPUT');
    const locale =
      typeof input.locale === 'string' && input.locale.length > 0 && input.locale.length <= 16
        ? input.locale
        : 'vi-VN';
    const now = this.ports.clock?.now() ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    let admissionDigest: string;
    try {
      admissionDigest = this.ports.digest.digestAdmission(email.value);
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    const existing = await this.ports.repository.findActiveByAdmission(
      admissionDigest,
      EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1,
    );
    if (existing && Date.parse(existing.resendAvailableAt) > now.getTime()) {
      return Object.freeze({ accepted: true as const, value: { requested: true as const } });
    }
    const code = sixDigitCode(this.ports.codes);
    if (!code) return rejected('VERIFICATION_UNAVAILABLE');
    const challengeId = this.ports.ids?.next() ?? randomUUID();
    if (!parseStableIdentifierV1(challengeId).accepted) return rejected('VERIFICATION_UNAVAILABLE');
    let codeDigest: string;
    try {
      codeDigest = this.ports.digest.digestCode(code);
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    await this.ports.repository.revokeActive(
      admissionDigest,
      EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1,
    );
    const challenge: EmailVerificationChallengeRecordV1 = Object.freeze({
      id: challengeId,
      purpose: EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1,
      admissionDigest,
      codeDigest,
      locale,
      attemptCount: 0,
      resendAvailableAt: addSeconds(now, EMAIL_VERIFICATION_RESEND_SECONDS_V1),
      issuedAt: now.toISOString(),
      expiresAt: addSeconds(now, EMAIL_VERIFICATION_EXPIRY_SECONDS_V1),
      status: 'ACTIVE',
      revision: 1,
    });
    await this.ports.repository.save(challenge);
    try {
      await this.ports.delivery.deliver({
        email: email.value,
        code,
        locale,
        ...(typeof input.correlationId === 'string'
          ? { correlationId: input.correlationId }
          : {}),
      });
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    return Object.freeze({ accepted: true as const, value: { requested: true as const } });
  }

  public async verifyEmailRegistration(input: {
    readonly challengeId: unknown;
    readonly code: unknown;
    readonly email: unknown;
    readonly idempotencyKey: unknown;
  }): Promise<EmailVerificationVerifyResultV1> {
    const challengeId =
      typeof input.challengeId === 'string' && parseStableIdentifierV1(input.challengeId).accepted
        ? input.challengeId
        : undefined;
    const email = normalizeEmailAddressV1(input.email);
    const code = parseCode(input.code);
    const idempotencyKey =
      typeof input.idempotencyKey === 'string' &&
      input.idempotencyKey.length >= 8 &&
      input.idempotencyKey.length <= 200
        ? input.idempotencyKey
        : undefined;
    if (!challengeId || !email.accepted || !code || !idempotencyKey) {
      return rejected('INVALID_INPUT');
    }
    const now = this.ports.clock?.now() ?? new Date();
    const challenge = await this.ports.repository.findById(challengeId);
    if (!challenge) return rejected('INVALID_CODE');
    if (challenge.status === 'LOCKED') return rejected('LOCKED');
    if (challenge.status === 'CONSUMED') {
      return this.ports.repository.consumeAndActivate({
        challengeId,
        expectedRevision: challenge.revision,
        email: email.value,
        idempotencyKey,
      });
    }
    if (challenge.status !== 'ACTIVE') return rejected('INVALID_CODE');
    if (Date.parse(challenge.expiresAt) <= now.getTime()) return rejected('EXPIRED');
    let codeDigest: string;
    let admissionDigest: string;
    try {
      codeDigest = this.ports.digest.digestCode(code);
      admissionDigest = this.ports.digest.digestAdmission(email.value);
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    if (challenge.admissionDigest !== admissionDigest || challenge.codeDigest !== codeDigest) {
      const nextAttempts = challenge.attemptCount + 1;
      const nextStatus =
        nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS_V1 ? 'LOCKED' : challenge.status;
      await this.ports.repository.save({
        ...challenge,
        attemptCount: nextAttempts,
        status: nextStatus,
        revision: challenge.revision + 1,
      });
      return rejected(nextStatus === 'LOCKED' ? 'LOCKED' : 'INVALID_CODE');
    }
    return this.ports.repository.consumeAndActivate({
      challengeId,
      expectedRevision: challenge.revision,
      email: email.value,
      idempotencyKey,
    });
  }
}
