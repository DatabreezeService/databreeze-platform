import type { PersonalOrganizationBootstrapV1 } from '@databreeze/domain/identity/v1';

import type { PasswordCredentialV1 } from '../domain/password-credential.js';
import type {
  AuthenticationSessionV1,
  AuthenticatedPrincipalV1,
} from './authentication.port.js';
import type { SessionClientPlatformV1 } from './session-policy.v1.js';

export const EMAIL_VERIFICATION_EXPIRY_SECONDS_V1 = 10 * 60;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS_V1 = 5;
export const EMAIL_VERIFICATION_RESEND_SECONDS_V1 = 60;
export const EMAIL_VERIFICATION_PURPOSE_REGISTRATION_V1 = 'REGISTRATION';

export type EmailVerificationFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'INVALID_CODE'
  | 'EXPIRED'
  | 'LOCKED'
  | 'RESEND_TOO_SOON'
  | 'VERIFICATION_UNAVAILABLE';

export interface PendingEmailRegistrationV1 {
  readonly email: string;
  readonly credentialId: string;
  readonly credential: PasswordCredentialV1;
  readonly bootstrap: PersonalOrganizationBootstrapV1;
}

export interface EmailRegistrationSessionPersistenceV1 {
  readonly session: {
    readonly id: string;
    readonly userId: string;
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly familyId: string;
    readonly issuedAt: string;
    readonly accessExpiresAt: string;
    readonly inactivityExpiresAt: string;
    readonly absoluteExpiresAt: string;
  };
  readonly refreshToken: {
    readonly id: string;
    readonly sessionId: string;
    readonly familyId: string;
    readonly tokenDigest: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  };
  readonly accessToken: {
    readonly id: string;
    readonly sessionId: string;
    readonly tokenDigest: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  };
}

export interface EmailRegistrationActivationV1 {
  readonly principal: AuthenticatedPrincipalV1;
  readonly session: AuthenticationSessionV1;
}

export interface EmailVerificationChallengeRecordV1 {
  readonly id: string;
  readonly purpose: string;
  readonly admissionDigest: string;
  readonly codeDigest: string;
  readonly locale: string;
  readonly pendingRegistrationEnvelope: string;
  readonly attemptCount: number;
  readonly resendAvailableAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: 'ACTIVE' | 'CONSUMED' | 'REVOKED' | 'LOCKED';
  readonly consumedAt?: string;
  readonly activationIdempotencyKey?: string;
  readonly activationRequestHash?: string;
  readonly activationResultEnvelope?: string;
  readonly activatedSessionId?: string;
  readonly revision: number;
}

export interface EmailVerificationDigestPortV1 {
  digestAdmission(email: string): string;
  digestCode(challengeId: string, code: string): string;
}

export interface EmailVerificationEnvelopePortV1 {
  seal(value: Readonly<Record<string, unknown>>): string;
  open(envelope: string): Readonly<Record<string, unknown>> | undefined;
}

export interface EmailVerificationDeliveryPortV1 {
  deliver(input: {
    readonly email: string;
    readonly code: string;
    readonly locale: string;
    readonly correlationId?: string;
  }): Promise<void>;
}

export interface EmailVerificationRepositoryPortV1 {
  findActiveByAdmission(
    admissionDigest: string,
    purpose: string,
  ): Promise<EmailVerificationChallengeRecordV1 | undefined>;
  findById(challengeId: string): Promise<EmailVerificationChallengeRecordV1 | undefined>;
  save(challenge: EmailVerificationChallengeRecordV1): Promise<void>;
  revokeActive(admissionDigest: string, purpose: string): Promise<void>;
  consumeAndActivate(input: {
    readonly challengeId: string;
    readonly expectedRevision: number;
    readonly pending: PendingEmailRegistrationV1;
    readonly activation: EmailRegistrationActivationV1;
    readonly sessionPersistence: EmailRegistrationSessionPersistenceV1;
    readonly clientPlatform: SessionClientPlatformV1;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly activationResultEnvelope: string;
    readonly consumedAt: string;
  }): Promise<boolean>;
}

export type EmailVerificationRequestResultV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly requested: true; readonly challengeId: string };
    }
  | { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 };

export type EmailVerificationVerifyResultV1 =
  | {
      readonly accepted: true;
      readonly value: EmailRegistrationActivationV1 & { readonly alreadyCompleted: boolean };
    }
  | { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 };
