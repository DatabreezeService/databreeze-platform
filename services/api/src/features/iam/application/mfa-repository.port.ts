import type { MfaStateV1 } from '@databreeze/domain/mfa/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export const MFA_REPOSITORY_PORT = Symbol('MFA_REPOSITORY_PORT');

export interface MfaTransactionPortV1 {
  findState(userId: StableIdentifierV1): Promise<MfaStateV1>;
  saveState(userId: StableIdentifierV1, state: MfaStateV1): Promise<void>;
  /** Clears the post-recovery gate after a newly verified factor; returns whether a flag changed. */
  clearRecoveryReenrollment?(userId: StableIdentifierV1): Promise<boolean>;
}

export interface MfaRepositoryPortV1 extends MfaTransactionPortV1 {
  withTransaction<TValue>(
    work: (transaction: MfaTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
