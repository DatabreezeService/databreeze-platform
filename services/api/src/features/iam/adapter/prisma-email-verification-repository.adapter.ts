import {
  PrismaIdentityBootstrapTransactionAdapter,
  type IdentityBootstrapDatabaseClientV1,
  type IdentityBootstrapPolicyProvisionerFactoryV1,
} from './prisma-identity-bootstrap-repository.adapter.js';
import type {
  EmailVerificationChallengeRecordV1,
  EmailVerificationRepositoryPortV1,
} from '../application/email-verification-repository.port.js';

interface ChallengeRowV1 {
  readonly id: string;
  readonly purpose: string;
  readonly admissionDigest: string;
  readonly codeDigest: string;
  readonly locale: string;
  readonly pendingRegistrationEnvelope: string | null;
  readonly attemptCount: number;
  readonly resendAvailableAt: Date;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: string;
  readonly consumedAt: Date | null;
  readonly activationIdempotencyKey: string | null;
  readonly activationRequestHash: string | null;
  readonly activationResultEnvelope: string | null;
  readonly activatedSessionId: string | null;
  readonly revision: number;
}

interface ChallengeDelegateV1 {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<ChallengeRowV1 | null>;
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ChallengeRowV1 | null>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<ChallengeRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

interface CreateDelegateV1 {
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

interface UserDelegateV1 extends CreateDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly id: string } | null>;
}

export interface EmailVerificationDatabaseClientV1 extends IdentityBootstrapDatabaseClientV1 {
  readonly iamEmailVerificationChallenge: ChallengeDelegateV1;
  readonly userIdentity: IdentityBootstrapDatabaseClientV1['userIdentity'] & UserDelegateV1;
  readonly passwordCredential: CreateDelegateV1;
  readonly sessionRecord: CreateDelegateV1;
  readonly refreshTokenRecord: CreateDelegateV1;
  readonly accessTokenRecord: CreateDelegateV1;
  $transaction<TValue>(
    work: (transaction: EmailVerificationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function record(row: ChallengeRowV1): EmailVerificationChallengeRecordV1 {
  const status =
    row.status === 'ACTIVE' ||
    row.status === 'CONSUMED' ||
    row.status === 'REVOKED' ||
    row.status === 'LOCKED'
      ? row.status
      : 'REVOKED';
  return Object.freeze({
    id: row.id,
    purpose: row.purpose,
    admissionDigest: row.admissionDigest,
    codeDigest: row.codeDigest,
    locale: row.locale,
    pendingRegistrationEnvelope: row.pendingRegistrationEnvelope ?? '',
    attemptCount: row.attemptCount,
    resendAvailableAt: row.resendAvailableAt.toISOString(),
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status,
    ...(row.consumedAt ? { consumedAt: row.consumedAt.toISOString() } : {}),
    ...(row.activationIdempotencyKey
      ? { activationIdempotencyKey: row.activationIdempotencyKey }
      : {}),
    ...(row.activationRequestHash ? { activationRequestHash: row.activationRequestHash } : {}),
    ...(row.activationResultEnvelope
      ? { activationResultEnvelope: row.activationResultEnvelope }
      : {}),
    ...(row.activatedSessionId ? { activatedSessionId: row.activatedSessionId } : {}),
    revision: row.revision,
  });
}

function persistence(
  challenge: EmailVerificationChallengeRecordV1,
): Readonly<Record<string, unknown>> {
  return {
    id: challenge.id,
    purpose: challenge.purpose,
    admissionDigest: challenge.admissionDigest,
    codeDigest: challenge.codeDigest,
    locale: challenge.locale,
    pendingRegistrationEnvelope: challenge.pendingRegistrationEnvelope,
    attemptCount: challenge.attemptCount,
    resendAvailableAt: new Date(challenge.resendAvailableAt),
    issuedAt: new Date(challenge.issuedAt),
    expiresAt: new Date(challenge.expiresAt),
    status: challenge.status,
    consumedAt: challenge.consumedAt ? new Date(challenge.consumedAt) : null,
    revokedAt: challenge.status === 'REVOKED' ? new Date() : null,
    activationIdempotencyKey: challenge.activationIdempotencyKey ?? null,
    activationRequestHash: challenge.activationRequestHash ?? null,
    activationResultEnvelope: challenge.activationResultEnvelope ?? null,
    activatedSessionId: challenge.activatedSessionId ?? null,
    revision: challenge.revision,
  };
}

function uniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** IAM-022/IAM-023: durable challenge state and one-transaction activation/session issuance. */
export class PrismaEmailVerificationRepositoryAdapter implements EmailVerificationRepositoryPortV1 {
  public constructor(
    private readonly client: EmailVerificationDatabaseClientV1,
    private readonly policyProvisionerFactory?: IdentityBootstrapPolicyProvisionerFactoryV1,
  ) {}

  public async findActiveByAdmission(admissionDigest: string, purpose: string) {
    const row = await this.client.iamEmailVerificationChallenge.findFirst({
      where: { admissionDigest, purpose, status: 'ACTIVE' },
      orderBy: { issuedAt: 'desc' },
    });
    return row ? record(row) : undefined;
  }

  public async findById(challengeId: string) {
    const row = await this.client.iamEmailVerificationChallenge.findUnique({
      where: { id: challengeId },
    });
    return row ? record(row) : undefined;
  }

  public async save(challenge: EmailVerificationChallengeRecordV1): Promise<void> {
    const data = persistence(challenge);
    const existing = await this.client.iamEmailVerificationChallenge.findUnique({
      where: { id: challenge.id },
    });
    if (!existing) {
      if (challenge.revision !== 1) throw new Error('IAM_EMAIL_VERIFICATION_REVISION_CONFLICT');
      await this.client.iamEmailVerificationChallenge.create({ data });
      return;
    }
    const updated = await this.client.iamEmailVerificationChallenge.updateMany({
      where: { id: challenge.id, revision: challenge.revision - 1 },
      data,
    });
    if (updated.count !== 1) throw new Error('IAM_EMAIL_VERIFICATION_REVISION_CONFLICT');
  }

  public async revokeActive(admissionDigest: string, purpose: string): Promise<void> {
    await this.client.iamEmailVerificationChallenge.updateMany({
      where: { admissionDigest, purpose, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revision: { increment: 1 } },
    });
  }

  public async consumeAndActivate(
    input: Parameters<EmailVerificationRepositoryPortV1['consumeAndActivate']>[0],
  ): Promise<boolean> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const existingUser = await transaction.userIdentity.findUnique({
          where: { email: input.pending.email },
        });
        if (existingUser) return false;
        const reserved = await transaction.iamEmailVerificationChallenge.updateMany({
          where: {
            id: input.challengeId,
            revision: input.expectedRevision,
            status: 'ACTIVE',
            activationIdempotencyKey: null,
          },
          data: {
            status: 'CONSUMED',
            consumedAt: new Date(input.consumedAt),
            activationIdempotencyKey: input.idempotencyKey,
            activationRequestHash: input.requestHash,
            activationResultEnvelope: input.activationResultEnvelope,
            activatedSessionId: input.activation.session.sessionId,
            revision: { increment: 1 },
          },
        });
        if (reserved.count !== 1) return false;
        const bootstrap = input.pending.bootstrap;
        await transaction.userIdentity.create({
          data: {
            id: bootstrap.user.id,
            email: input.pending.email,
            displayName: bootstrap.user.displayName,
            locale: bootstrap.user.locale,
            status: bootstrap.user.status,
            securityEpoch: bootstrap.user.securityEpoch,
            createdAt: new Date(bootstrap.user.createdAt),
          },
        });
        await transaction.passwordCredential.create({
          data: {
            id: input.pending.credentialId,
            userId: bootstrap.user.id,
            algorithm: input.pending.credential.algorithm,
            encodedHash: input.pending.credential.encodedHash,
            createdAt: new Date(bootstrap.user.createdAt),
          },
        });
        await new PrismaIdentityBootstrapTransactionAdapter(
          transaction,
          this.policyProvisionerFactory?.(transaction),
        ).save(bootstrap);
        const session = input.sessionPersistence.session;
        await transaction.sessionRecord.create({
          data: {
            ...session,
            issuedAt: new Date(session.issuedAt),
            accessExpiresAt: new Date(session.accessExpiresAt),
            inactivityExpiresAt: new Date(session.inactivityExpiresAt),
            absoluteExpiresAt: new Date(session.absoluteExpiresAt),
            status: 'ACTIVE',
          },
        });
        const refresh = input.sessionPersistence.refreshToken;
        await transaction.refreshTokenRecord.create({
          data: {
            ...refresh,
            issuedAt: new Date(refresh.issuedAt),
            expiresAt: new Date(refresh.expiresAt),
            status: 'ACTIVE',
          },
        });
        const access = input.sessionPersistence.accessToken;
        await transaction.accessTokenRecord.create({
          data: {
            ...access,
            issuedAt: new Date(access.issuedAt),
            expiresAt: new Date(access.expiresAt),
            status: 'ACTIVE',
          },
        });
        return true;
      });
    } catch (error) {
      if (uniqueConflict(error)) return false;
      throw error;
    }
  }
}
