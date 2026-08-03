import type { RecoveryChallengeV1 } from '@databreeze/domain/recovery/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { PasswordCredentialV1 } from '../domain/password-credential.js';

export const IAM_RECOVERY_REPOSITORY_PORT = Symbol('IAM_RECOVERY_REPOSITORY_PORT');
export const IAM_RECOVERY_ADMISSION_PORT = Symbol('IAM_RECOVERY_ADMISSION_PORT');
export const IAM_RECOVERY_COMPLETION_ADMISSION_PORT = Symbol(
  'IAM_RECOVERY_COMPLETION_ADMISSION_PORT',
);

export interface RecoveryCompletionInputV1 {
  readonly challenge: RecoveryChallengeV1;
  readonly credentialId: StableIdentifierV1;
  readonly credential: PasswordCredentialV1;
}

export interface RecoveryTransactionPortV1 {
  findUserIdByEmail(email: string): Promise<StableIdentifierV1 | undefined>;
  findChallengeByTokenDigest(tokenDigest: string): Promise<RecoveryChallengeV1 | undefined>;
  findActiveChallengeForUser(userId: StableIdentifierV1): Promise<RecoveryChallengeV1 | undefined>;
  saveChallenge(challenge: RecoveryChallengeV1): Promise<void>;
  completeRecovery(input: RecoveryCompletionInputV1): Promise<void>;
}

export interface RecoveryRepositoryPortV1 {
  withTransaction<TValue>(
    work: (transaction: RecoveryTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface RecoveryDigestPortV1 {
  digestToken(rawToken: string): string;
  digestEmail(normalizedEmail: string): string;
}

/** Optional abuse-control boundary; callers must not use it to reveal account existence. */
export interface RecoveryAdmissionPortV1 {
  allow(keyDigest: string, issuedAt: string): Promise<boolean>;
}

export interface RecoveryDeliveryPortV1 {
  deliver(input: {
    readonly challengeId: StableIdentifierV1;
    readonly recipientEmail: string;
    readonly rawToken: string;
    readonly expiresAt: string;
  }): Promise<void>;
}

export type RecoveryFailureCodeV1 = 'INVALID_INPUT' | 'INVALID_TOKEN' | 'RECOVERY_UNAVAILABLE';

export type RecoveryRequestResultV1 =
  | { readonly accepted: true; readonly value: { readonly requested: true } }
  | { readonly accepted: false; readonly code: RecoveryFailureCodeV1 };

export type RecoveryCompletionResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly userId: StableIdentifierV1;
        readonly mfaReenrollmentRequired: true;
      };
    }
  | { readonly accepted: false; readonly code: RecoveryFailureCodeV1 };
