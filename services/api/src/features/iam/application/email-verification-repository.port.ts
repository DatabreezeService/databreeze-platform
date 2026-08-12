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

export interface EmailVerificationChallengeRecordV1 {
  readonly id: string;
  readonly purpose: string;
  readonly admissionDigest: string;
  readonly codeDigest: string;
  readonly locale: string;
  readonly attemptCount: number;
  readonly resendAvailableAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: 'ACTIVE' | 'CONSUMED' | 'REVOKED' | 'LOCKED';
  readonly revision: number;
}

export interface EmailVerificationDigestPortV1 {
  digestAdmission(email: string): string;
  digestCode(code: string): string;
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
    readonly email: string;
    readonly idempotencyKey: string;
  }): Promise<
    | {
        readonly accepted: true;
        readonly value: {
          readonly userId: string;
          readonly organizationId: string;
          readonly workspaceId: string;
          readonly alreadyCompleted: boolean;
        };
      }
    | { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 }
  >;
}

export type EmailVerificationRequestResultV1 =
  | { readonly accepted: true; readonly value: { readonly requested: true } }
  | { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 };

export type EmailVerificationVerifyResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly userId: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly alreadyCompleted: boolean;
      };
    }
  | { readonly accepted: false; readonly code: EmailVerificationFailureCodeV1 };
