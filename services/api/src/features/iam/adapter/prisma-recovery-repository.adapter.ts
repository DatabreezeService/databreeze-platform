import {
  createRecoveryChallengeV1,
  type RecoveryChallengeV1,
} from '@databreeze/domain/recovery/v1';
import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  RecoveryCompletionInputV1,
  RecoveryRepositoryPortV1,
  RecoveryTransactionPortV1,
} from '../application/recovery-repository.port.js';

export interface RecoveryUserDatabaseRowV1 {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly securityEpoch: number;
  readonly mfaReenrollmentRequired: boolean;
}

export interface RecoveryChallengeDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly tokenDigest: string;
  readonly emailDigest: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: string;
  readonly consumedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly revision: number;
}

export interface RecoverySessionDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
}

interface RecoveryCompensationFailureDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<Record<string, string>>;
  }): Promise<Readonly<Record<string, unknown>> | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<Readonly<Record<string, unknown>>>;
}

interface UniqueDelegateV1<TRow> {
  findUnique(input: { readonly where: Readonly<Record<string, string>> }): Promise<TRow | null>;
}

interface UserDelegateV1 extends UniqueDelegateV1<RecoveryUserDatabaseRowV1> {
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

interface ChallengeDelegateV1 extends UniqueDelegateV1<RecoveryChallengeDatabaseRowV1> {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly RecoveryChallengeDatabaseRowV1[]>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<RecoveryChallengeDatabaseRowV1>;
  update(input: {
    readonly where: Readonly<Record<string, string>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<RecoveryChallengeDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

interface PasswordCredentialDelegateV1 {
  update(input: {
    readonly where: Readonly<Record<string, string>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<unknown>;
}

interface SessionDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly RecoverySessionDatabaseRowV1[]>;
  update(input: {
    readonly where: Readonly<Record<string, string>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<unknown>;
}

interface UpdateManyDelegateV1 {
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface RecoveryDatabaseClientV1 {
  readonly userIdentity: UserDelegateV1;
  readonly recoveryChallenge: ChallengeDelegateV1;
  readonly passwordCredential: PasswordCredentialDelegateV1;
  readonly sessionRecord: SessionDelegateV1;
  readonly refreshTokenRecord: UpdateManyDelegateV1;
  readonly accessTokenRecord: UpdateManyDelegateV1;
  readonly mfaFactor: UpdateManyDelegateV1;
  readonly recoveryCompensationFailure: RecoveryCompensationFailureDelegateV1;
  $transaction<TValue>(
    work: (transaction: RecoveryDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: Date | null | undefined): string | undefined {
  if (!input) return undefined;
  const value = input.toISOString();
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function challengeFromRow(row: RecoveryChallengeDatabaseRowV1): RecoveryChallengeV1 {
  const created = createRecoveryChallengeV1({
    id: row.id,
    userId: row.userId,
    tokenDigest: row.tokenDigest,
    emailDigest: row.emailDigest,
    issuedAt: timestamp(row.issuedAt),
    expiresAt: timestamp(row.expiresAt),
    revision: row.revision,
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  if (row.status !== 'ACTIVE' && row.status !== 'CONSUMED' && row.status !== 'REVOKED')
    throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  const consumedAt = timestamp(row.consumedAt);
  const revokedAt = timestamp(row.revokedAt);
  if ((row.consumedAt && !consumedAt) || (row.revokedAt && !revokedAt))
    throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  if (row.status === 'CONSUMED' && !consumedAt) throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  if (row.status === 'REVOKED' && !revokedAt) throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  if (row.status === 'ACTIVE' && (consumedAt || revokedAt))
    throw new Error('IAM_PERSISTED_RECOVERY_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status,
    ...(consumedAt ? { consumedAt } : {}),
    ...(revokedAt ? { revokedAt } : {}),
  });
}

function challengeData(challenge: RecoveryChallengeV1): Record<string, unknown> {
  return {
    id: challenge.id,
    userId: challenge.userId,
    tokenDigest: challenge.tokenDigest,
    emailDigest: challenge.emailDigest,
    issuedAt: new Date(challenge.issuedAt),
    expiresAt: new Date(challenge.expiresAt),
    status: challenge.status,
    consumedAt: challenge.consumedAt ? new Date(challenge.consumedAt) : null,
    revokedAt: challenge.revokedAt ? new Date(challenge.revokedAt) : null,
    revision: challenge.revision,
  };
}

function sameImmutableFields(left: RecoveryChallengeV1, right: RecoveryChallengeV1): boolean {
  return (
    left.id === right.id &&
    left.userId === right.userId &&
    left.tokenDigest === right.tokenDigest &&
    left.emailDigest === right.emailDigest &&
    left.issuedAt === right.issuedAt &&
    left.expiresAt === right.expiresAt
  );
}

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

class PrismaRecoveryTransactionAdapter implements RecoveryTransactionPortV1 {
  public constructor(private readonly client: RecoveryDatabaseClientV1) {}

  public async findUserIdByEmail(emailInput: string) {
    const email = normalizeEmailAddressV1(emailInput);
    if (!email.accepted) return undefined;
    const user = await this.client.userIdentity.findUnique({ where: { email: email.value } });
    const userId = stable(user?.id);
    return user && user.status === 'ACTIVE' && user.email === email.value ? userId : undefined;
  }

  public async findChallengeByTokenDigest(tokenDigest: string) {
    const row = await this.client.recoveryChallenge.findUnique({ where: { tokenDigest } });
    return row ? challengeFromRow(row) : undefined;
  }

  public async findActiveChallengeForUser(userId: StableIdentifierV1) {
    const rows = await this.client.recoveryChallenge.findMany({
      where: { userId, status: 'ACTIVE' },
    });
    const row = [...rows].sort((left, right) => left.id.localeCompare(right.id))[0];
    return row ? challengeFromRow(row) : undefined;
  }

  public async isChallengeCompensationBlocked(tokenDigest: string): Promise<boolean> {
    const row = await this.client.recoveryCompensationFailure.findUnique({
      where: { tokenDigest },
    });
    return row !== null;
  }

  public async recordChallengeCompensationFailure(
    tokenDigest: string,
    recordedAt: string,
  ): Promise<void> {
    try {
      await this.client.recoveryCompensationFailure.create({
        data: { tokenDigest, recordedAt: new Date(recordedAt) },
      });
    } catch (error) {
      if (isConflict(error)) return;
      throw error;
    }
  }

  public async saveChallenge(challenge: RecoveryChallengeV1): Promise<void> {
    if (!stable(challenge.id) || !stable(challenge.userId))
      throw new Error('IAM_RECOVERY_INVALID_IDENTIFIER');
    const existingRow = await this.client.recoveryChallenge.findUnique({
      where: { id: challenge.id },
    });
    try {
      if (!existingRow) {
        if (challenge.revision !== 1) throw new Error('IAM_RECOVERY_REVISION_CONFLICT');
        await this.client.recoveryChallenge.create({ data: challengeData(challenge) });
        return;
      }
      const existing = challengeFromRow(existingRow);
      if (!sameImmutableFields(existing, challenge)) throw new Error('IAM_RECOVERY_IMMUTABLE');
      if (
        existing.revision === challenge.revision &&
        JSON.stringify(existing) === JSON.stringify(challenge)
      )
        return;
      if (challenge.revision !== existing.revision + 1)
        throw new Error('IAM_RECOVERY_REVISION_CONFLICT');
      const updated = await this.client.recoveryChallenge.updateMany({
        where: { id: challenge.id, revision: existing.revision },
        data: challengeData(challenge),
      });
      if (updated.count !== 1) throw new Error('IAM_RECOVERY_REVISION_CONFLICT');
    } catch (error) {
      if (isConflict(error)) throw new Error('IAM_RECOVERY_CONFLICT');
      throw error;
    }
  }

  public async completeRecovery(input: RecoveryCompletionInputV1): Promise<void> {
    if (input.challenge.status !== 'CONSUMED' || !input.challenge.consumedAt)
      throw new Error('IAM_RECOVERY_STATE_INVALID');
    const user = await this.client.userIdentity.findUnique({
      where: { id: input.challenge.userId },
    });
    if (!user || user.status !== 'ACTIVE' || user.id !== input.challenge.userId)
      throw new Error('IAM_RECOVERY_USER_NOT_FOUND');
    const updatedUser = await this.client.userIdentity.updateMany({
      where: { id: user.id, securityEpoch: user.securityEpoch },
      data: { securityEpoch: user.securityEpoch + 1, mfaReenrollmentRequired: true },
    });
    if (updatedUser.count !== 1) throw new Error('IAM_RECOVERY_REVISION_CONFLICT');
    await this.client.passwordCredential.update({
      where: { userId: user.id },
      data: {
        id: input.credentialId,
        algorithm: input.credential.algorithm,
        encodedHash: input.credential.encodedHash,
        rotatedAt: new Date(input.challenge.consumedAt),
      },
    });
    const revokedAt = new Date(input.challenge.consumedAt);
    const sessions = await this.client.sessionRecord.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
    });
    for (const session of sessions) {
      await this.client.refreshTokenRecord.updateMany({
        where: { familyId: session.familyId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      await this.client.accessTokenRecord.updateMany({
        where: { sessionId: session.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt },
      });
      await this.client.sessionRecord.update({
        where: { id: session.id },
        data: { status: 'REVOKED', revokedAt },
      });
    }
    await this.client.mfaFactor.updateMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
      data: { status: 'REVOKED', revokedAt, revision: { increment: 1 } },
    });
    await this.saveChallenge(input.challenge);
  }
}

/** PostgreSQL adapter for the recovery challenge and security-state transaction. */
export class PrismaRecoveryRepositoryAdapter implements RecoveryRepositoryPortV1 {
  public constructor(private readonly client: RecoveryDatabaseClientV1) {}

  public withTransaction<TValue>(
    work: (transaction: RecoveryTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaRecoveryTransactionAdapter(transaction)),
    );
  }
}
