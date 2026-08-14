import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  bootstrapPersonalOrganizationV1,
  normalizeEmailAddressV1,
  type LocaleV1,
  type PersonalOrganizationBootstrapV1,
} from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { PasswordCredentialV1 } from '../domain/password-credential.js';
import type { PasswordCredentialService } from './password-credential.service.js';
import { sessionPolicyForPlatformV1, type SessionClientPlatformV1 } from './session-policy.v1.js';
import type {
  EmailRegistrationActivationV1,
  EmailRegistrationSessionPersistenceV1,
  EmailVerificationChallengeRecordV1,
  EmailVerificationDeliveryPortV1,
  EmailVerificationDigestPortV1,
  EmailVerificationEnvelopePortV1,
  EmailVerificationFailureCodeV1,
  EmailVerificationRepositoryPortV1,
  EmailVerificationRequestResultV1,
  EmailVerificationVerifyResultV1,
  PendingEmailRegistrationV1,
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
  readonly envelope: EmailVerificationEnvelopePortV1;
  readonly delivery: EmailVerificationDeliveryPortV1;
  readonly passwordCredentials: PasswordCredentialService;
  readonly clock?: EmailVerificationClockV1;
  readonly ids?: { next(): string };
  readonly activationIds?: { next(): string };
  readonly codes?: { next(): string };
}

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function rejected(code: EmailVerificationFailureCodeV1): {
  readonly accepted: false;
  readonly code: EmailVerificationFailureCodeV1;
} {
  return Object.freeze({ accepted: false, code });
}

function sixDigitCode(generator?: { next(): string }): string | undefined {
  try {
    const raw = generator?.next() ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    return /^\d{6}$/u.test(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function selectedLocale(input: unknown): LocaleV1 | undefined {
  return input === undefined || input === 'vi-VN' ? 'vi-VN' : input === 'en' ? 'en' : undefined;
}

function clientPlatform(input: unknown): SessionClientPlatformV1 | undefined {
  return input === 'web' || input === 'desktop' || input === 'android' ? input : undefined;
}

function stableId(input: unknown): string | undefined {
  return typeof input === 'string' && parseStableIdentifierV1(input).accepted ? input : undefined;
}

function activationRequestHash(
  challengeId: string,
  idempotencyKey: string,
  platform: SessionClientPlatformV1,
): string {
  return createHash('sha256')
    .update(`databreeze:iam:registration-activation:v1\u0000${challengeId}\u0000${idempotencyKey}\u0000${platform}`, 'utf8')
    .digest('hex');
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

function token(tokenId: string): string {
  return `${tokenId}.${randomBytes(32).toString('base64url')}`;
}

function isPasswordCredential(input: unknown): input is PasswordCredentialV1 {
  if (typeof input !== 'object' || input === null) return false;
  const value = input as Record<string, unknown>;
  return value['schemaVersion'] === 1 && value['algorithm'] === 'argon2id' && typeof value['encodedHash'] === 'string';
}

function pendingFromEnvelope(
  envelope: EmailVerificationEnvelopePortV1,
  sealed: string,
): PendingEmailRegistrationV1 | undefined {
  const value = envelope.open(sealed);
  if (!value) return undefined;
  const email = normalizeEmailAddressV1(value['email']);
  const credentialId = stableId(value['credentialId']);
  const credential = value['credential'];
  const bootstrap = value['bootstrap'];
  if (!email.accepted || !credentialId || !isPasswordCredential(credential) || typeof bootstrap !== 'object' || bootstrap === null)
    return undefined;
  const candidate = bootstrap as PersonalOrganizationBootstrapV1;
  if (
    !stableId(candidate.user?.id) ||
    !stableId(candidate.organization?.id) ||
    !stableId(candidate.workspace?.id) ||
    !stableId(candidate.project?.id) ||
    !stableId(candidate.membership?.id) ||
    candidate.user.id !== candidate.membership.principalId ||
    candidate.organization.id !== candidate.workspace.organizationId ||
    candidate.workspace.id !== candidate.project.workspaceId
  ) return undefined;
  return Object.freeze({ email: email.value, credentialId, credential, bootstrap: candidate });
}

function activationFromEnvelope(
  envelope: EmailVerificationEnvelopePortV1,
  sealed: string,
): EmailRegistrationActivationV1 | undefined {
  const value = envelope.open(sealed);
  if (!value || typeof value['principal'] !== 'object' || value['principal'] === null || typeof value['session'] !== 'object' || value['session'] === null)
    return undefined;
  const principal = value['principal'] as Record<string, unknown>;
  const session = value['session'] as Record<string, unknown>;
  if (
    !stableId(principal['userId']) ||
    !stableId(principal['organizationId']) ||
    !stableId(principal['workspaceId']) ||
    principal['securityEpoch'] !== 1 ||
    typeof principal['mfaRequired'] !== 'boolean' ||
    typeof principal['mfaReenrollmentRequired'] !== 'boolean' ||
    !stableId(session['sessionId']) ||
    typeof session['accessToken'] !== 'string' || session['accessToken'].length < 80 ||
    typeof session['refreshToken'] !== 'string' || session['refreshToken'].length < 80 ||
    typeof session['accessExpiresAt'] !== 'string'
  ) return undefined;
  return value as unknown as EmailRegistrationActivationV1;
}

function nextActivationId(ports: EmailVerificationServicePortsV1): string {
  const candidate = ports.activationIds?.next() ?? randomUUID();
  if (!stableId(candidate)) throw new Error('IAM_EMAIL_VERIFICATION_ID_INVALID');
  return candidate;
}

function makeActivation(
  ports: EmailVerificationServicePortsV1,
  pending: PendingEmailRegistrationV1,
  platform: SessionClientPlatformV1,
  now: Date,
): { readonly value: EmailRegistrationActivationV1; readonly persistence: EmailRegistrationSessionPersistenceV1 } {
  const policy = sessionPolicyForPlatformV1(platform);
  const sessionId = nextActivationId(ports);
  const familyId = nextActivationId(ports);
  const refreshTokenId = nextActivationId(ports);
  const accessTokenId = nextActivationId(ports);
  const refreshToken = token(refreshTokenId);
  const accessToken = token(accessTokenId);
  const issuedAt = now.toISOString();
  const accessExpiresAt = addSeconds(now, policy.accessTokenSeconds);
  const inactivityExpiresAt = addSeconds(now, policy.inactivitySeconds);
  const absoluteExpiresAt = addSeconds(now, policy.absoluteSeconds);
  const principal = Object.freeze({
    userId: pending.bootstrap.user.id,
    organizationId: pending.bootstrap.organization.id,
    workspaceId: pending.bootstrap.workspace.id,
    securityEpoch: 1,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  });
  const session = Object.freeze({ sessionId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt: absoluteExpiresAt });
  return Object.freeze({
    value: Object.freeze({ principal, session }),
    persistence: Object.freeze({
      session: Object.freeze({
        id: sessionId,
        userId: principal.userId,
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        familyId,
        issuedAt,
        accessExpiresAt,
        inactivityExpiresAt,
        absoluteExpiresAt,
      }),
      refreshToken: Object.freeze({ id: refreshTokenId, sessionId, familyId, tokenDigest: tokenDigest(refreshToken), issuedAt, expiresAt: absoluteExpiresAt }),
      accessToken: Object.freeze({ id: accessTokenId, sessionId, tokenDigest: tokenDigest(accessToken), issuedAt, expiresAt: accessExpiresAt }),
    }),
  });
}

/** IAM-022/IAM-023: protected OTP registration and atomic personal-workspace session activation. */
export class EmailVerificationService {
  public constructor(private readonly ports: EmailVerificationServicePortsV1) {}

  public async requestEmailVerification(input: {
    readonly email: unknown;
    readonly password: unknown;
    readonly locale?: unknown;
    readonly correlationId?: unknown;
    readonly clientPlatform?: unknown;
  }): Promise<EmailVerificationRequestResultV1> {
    const email = normalizeEmailAddressV1(input.email);
    const locale = selectedLocale(input.locale);
    if (!email.accepted || !locale || (input.clientPlatform !== undefined && !clientPlatform(input.clientPlatform)))
      return rejected('INVALID_INPUT');
    const credential = await this.ports.passwordCredentials.create(input.password);
    if (!credential.accepted)
      return rejected(credential.code === 'INVALID_PASSWORD' ? 'INVALID_INPUT' : 'VERIFICATION_UNAVAILABLE');
    const now = this.ports.clock?.now() ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return rejected('VERIFICATION_UNAVAILABLE');
    let admissionDigest: string;
    try {
      admissionDigest = this.ports.digest.digestAdmission(email.value);
      const existing = await this.ports.repository.findActiveByAdmission(admissionDigest, EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1);
      if (existing && Date.parse(existing.resendAvailableAt) > now.getTime())
        return Object.freeze({ accepted: true as const, value: { requested: true as const, challengeId: existing.id } });
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    const code = sixDigitCode(this.ports.codes);
    const challengeId = this.ports.ids?.next() ?? randomUUID();
    if (!code || !stableId(challengeId)) return rejected('VERIFICATION_UNAVAILABLE');
    const createdAt = now.toISOString();
    const bootstrap = bootstrapPersonalOrganizationV1({
      user: { id: nextActivationId(this.ports), displayName: locale === 'vi-VN' ? 'Người dùng DataBreeze' : 'DataBreeze user', locale, createdAt },
      organizationId: nextActivationId(this.ports),
      workspaceId: nextActivationId(this.ports),
      projectId: nextActivationId(this.ports),
      membershipId: nextActivationId(this.ports),
      createdAt,
    });
    if (!bootstrap.accepted) return rejected('VERIFICATION_UNAVAILABLE');
    let codeDigest: string;
    let pendingRegistrationEnvelope: string;
    try {
      codeDigest = this.ports.digest.digestCode(challengeId, code);
      pendingRegistrationEnvelope = this.ports.envelope.seal({
        email: email.value,
        credentialId: nextActivationId(this.ports),
        credential: credential.value,
        bootstrap: bootstrap.value,
      });
      await this.ports.repository.revokeActive(admissionDigest, EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1);
      const challenge: EmailVerificationChallengeRecordV1 = Object.freeze({
        id: challengeId,
        purpose: EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1,
        admissionDigest,
        codeDigest,
        locale,
        pendingRegistrationEnvelope,
        attemptCount: 0,
        resendAvailableAt: addSeconds(now, EMAIL_VERIFICATION_RESEND_SECONDS_V1),
        issuedAt: createdAt,
        expiresAt: addSeconds(now, EMAIL_VERIFICATION_EXPIRY_SECONDS_V1),
        status: 'ACTIVE',
        revision: 1,
      });
      await this.ports.repository.save(challenge);
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    try {
      await this.ports.delivery.deliver({
        email: email.value,
        code,
        locale,
        ...(typeof input.correlationId === 'string' ? { correlationId: input.correlationId } : {}),
      });
    } catch {
      try { await this.ports.repository.revokeActive(admissionDigest, EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1); } catch { /* fail closed */ }
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    return Object.freeze({ accepted: true as const, value: { requested: true as const, challengeId } });
  }

  public async verifyEmailRegistration(input: {
    readonly challengeId: unknown;
    readonly code: unknown;
    readonly idempotencyKey: unknown;
    readonly clientPlatform: unknown;
  }): Promise<EmailVerificationVerifyResultV1> {
    const challengeId = stableId(input.challengeId);
    const code = typeof input.code === 'string' && /^\d{6}$/u.test(input.code) ? input.code : undefined;
    const idempotencyKey = typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(input.idempotencyKey) ? input.idempotencyKey : undefined;
    const platform = clientPlatform(input.clientPlatform);
    if (!challengeId || !code || !idempotencyKey || !platform) return rejected('INVALID_INPUT');
    const requestHash = activationRequestHash(challengeId, idempotencyKey, platform);
    let challenge: EmailVerificationChallengeRecordV1 | undefined;
    try { challenge = await this.ports.repository.findById(challengeId); } catch { return rejected('VERIFICATION_UNAVAILABLE'); }
    if (!challenge) return rejected('INVALID_CODE');
    if (challenge.status === 'LOCKED') return rejected('LOCKED');
    if (challenge.status === 'CONSUMED') {
      if (challenge.activationIdempotencyKey !== idempotencyKey || challenge.activationRequestHash !== requestHash || !challenge.activationResultEnvelope)
        return rejected('INVALID_CODE');
      const activation = activationFromEnvelope(this.ports.envelope, challenge.activationResultEnvelope);
      return activation
        ? Object.freeze({ accepted: true as const, value: Object.freeze({ ...activation, alreadyCompleted: true }) })
        : rejected('VERIFICATION_UNAVAILABLE');
    }
    const now = this.ports.clock?.now() ?? new Date();
    if (challenge.status !== 'ACTIVE') return rejected('INVALID_CODE');
    if (Date.parse(challenge.expiresAt) <= now.getTime()) return rejected('EXPIRED');
    let codeDigest: string;
    try { codeDigest = this.ports.digest.digestCode(challengeId, code); } catch { return rejected('VERIFICATION_UNAVAILABLE'); }
    if (challenge.codeDigest !== codeDigest) {
      const nextAttempts = challenge.attemptCount + 1;
      const nextStatus = nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS_V1 ? 'LOCKED' : challenge.status;
      try { await this.ports.repository.save({ ...challenge, attemptCount: nextAttempts, status: nextStatus, revision: challenge.revision + 1 }); } catch { return rejected('VERIFICATION_UNAVAILABLE'); }
      return rejected(nextStatus === 'LOCKED' ? 'LOCKED' : 'INVALID_CODE');
    }
    const pending = pendingFromEnvelope(this.ports.envelope, challenge.pendingRegistrationEnvelope);
    if (!pending) return rejected('VERIFICATION_UNAVAILABLE');
    let generated: ReturnType<typeof makeActivation>;
    let activationResultEnvelope: string;
    try {
      generated = makeActivation(this.ports, pending, platform, now);
      activationResultEnvelope = this.ports.envelope.seal(generated.value as unknown as Readonly<Record<string, unknown>>);
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
    try {
      const consumed = await this.ports.repository.consumeAndActivate({
        challengeId,
        expectedRevision: challenge.revision,
        pending,
        activation: generated.value,
        sessionPersistence: generated.persistence,
        clientPlatform: platform,
        idempotencyKey,
        requestHash,
        activationResultEnvelope,
        consumedAt: now.toISOString(),
      });
      return consumed
        ? Object.freeze({ accepted: true as const, value: Object.freeze({ ...generated.value, alreadyCompleted: false }) })
        : rejected('INVALID_CODE');
    } catch {
      return rejected('VERIFICATION_UNAVAILABLE');
    }
  }
}
