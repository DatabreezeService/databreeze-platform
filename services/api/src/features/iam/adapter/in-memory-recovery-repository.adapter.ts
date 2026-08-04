import type { RecoveryChallengeV1 } from '@databreeze/domain/recovery/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  RecoveryCompletionInputV1,
  RecoveryRepositoryPortV1,
  RecoveryTransactionPortV1,
} from '../application/recovery-repository.port.js';

interface RecoveryAccountV1 {
  readonly email: string;
  readonly userId: string;
  credentialId?: string;
  credentialHash?: string;
  securityEpoch: number;
  mfaReenrollmentRequired: boolean;
  activeSessionFamilies: Set<string>;
}

function cloneChallenge(value: RecoveryChallengeV1): RecoveryChallengeV1 {
  return Object.freeze({ ...value });
}

/** In-memory recovery adapter that models credential, epoch, MFA, and session-family effects. */
export class InMemoryRecoveryRepositoryAdapter implements RecoveryRepositoryPortV1 {
  private accounts = new Map<string, RecoveryAccountV1>();
  private challenges = new Map<string, RecoveryChallengeV1>();
  private compensationFailures = new Map<string, string>();
  private transactionTail: Promise<void> = Promise.resolve();

  public seed(input: {
    readonly email: string;
    readonly userId: string;
    readonly securityEpoch?: number;
    readonly activeSessionFamilies?: readonly string[];
  }): void {
    this.accounts.set(input.email, {
      email: input.email,
      userId: input.userId,
      securityEpoch: input.securityEpoch ?? 1,
      mfaReenrollmentRequired: false,
      activeSessionFamilies: new Set(input.activeSessionFamilies ?? []),
    });
  }

  public account(userId: string): Readonly<RecoveryAccountV1> | undefined {
    const account = [...this.accounts.values()].find((candidate) => candidate.userId === userId);
    return account
      ? Object.freeze({ ...account, activeSessionFamilies: new Set(account.activeSessionFamilies) })
      : undefined;
  }

  public challenge(tokenDigest: string): RecoveryChallengeV1 | undefined {
    const challenge = this.challenges.get(tokenDigest);
    return challenge ? cloneChallenge(challenge) : undefined;
  }

  public async withTransaction<TValue>(
    work: (transaction: RecoveryTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeAccounts = new Map(
      [...this.accounts].map(([key, value]) => [
        key,
        { ...value, activeSessionFamilies: new Set(value.activeSessionFamilies) },
      ]),
    );
    const beforeChallenges = new Map(this.challenges);
    const beforeCompensationFailures = new Map(this.compensationFailures);
    const transaction: RecoveryTransactionPortV1 = {
      findUserIdByEmail: async (email) => {
        await Promise.resolve();
        return this.accounts.get(email)?.userId as StableIdentifierV1 | undefined;
      },
      findChallengeByTokenDigest: async (tokenDigest) => {
        await Promise.resolve();
        const challenge = this.challenges.get(tokenDigest);
        return challenge ? cloneChallenge(challenge) : undefined;
      },
      findActiveChallengeForUser: async (userId) => {
        await Promise.resolve();
        return [...this.challenges.values()].find(
          (challenge) => challenge.userId === userId && challenge.status === 'ACTIVE',
        );
      },
      isChallengeCompensationBlocked: async (tokenDigest) => {
        await Promise.resolve();
        return this.compensationFailures.has(tokenDigest);
      },
      recordChallengeCompensationFailure: async (tokenDigest, recordedAt) => {
        await Promise.resolve();
        this.compensationFailures.set(tokenDigest, recordedAt);
      },
      saveChallenge: async (challenge) => {
        await Promise.resolve();
        const existing = this.challenges.get(challenge.tokenDigest);
        if (existing && existing.revision + 1 !== challenge.revision)
          throw new Error('IAM_RECOVERY_REVISION_CONFLICT');
        this.challenges.set(challenge.tokenDigest, cloneChallenge(challenge));
      },
      completeRecovery: async (input: RecoveryCompletionInputV1) => {
        await Promise.resolve();
        const account = [...this.accounts.values()].find(
          (candidate) => candidate.userId === input.challenge.userId,
        );
        if (!account) throw new Error('IAM_RECOVERY_USER_NOT_FOUND');
        this.accounts.set(account.email, {
          ...account,
          credentialId: input.credentialId,
          credentialHash: input.credential.encodedHash,
          securityEpoch: account.securityEpoch + 1,
          mfaReenrollmentRequired: true,
          activeSessionFamilies: new Set(),
        });
        this.challenges.set(input.challenge.tokenDigest, cloneChallenge(input.challenge));
      },
    };
    try {
      return await work(transaction);
    } catch (error) {
      this.accounts = beforeAccounts;
      this.challenges = beforeChallenges;
      this.compensationFailures = beforeCompensationFailures;
      throw error;
    } finally {
      release();
    }
  }
}
