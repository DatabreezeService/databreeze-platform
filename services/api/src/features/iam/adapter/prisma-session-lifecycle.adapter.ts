import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  createSessionRecordV1,
  rotateRefreshFamilyV1,
  type SessionRecordV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  AuthenticationSessionV1,
  AuthenticatedPrincipalV1,
  SessionIssuerPortV1,
} from '../application/authentication.port.js';
import type {
  SessionLifecyclePortV1,
  SessionRefreshFailureCodeV1,
  SessionRefreshResultV1,
} from '../application/session-lifecycle.port.js';
import { sessionPolicyForPlatformV1 } from '../application/session-policy.v1.js';

export interface SessionRecordDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly familyId: string;
  readonly issuedAt: Date;
  readonly accessExpiresAt: Date;
  readonly inactivityExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly status: string;
  readonly revokedAt?: Date | null;
}

export interface RefreshTokenDatabaseRowV1 {
  readonly id: string;
  readonly sessionId: string;
  readonly familyId: string;
  readonly tokenDigest: string;
  readonly status: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly usedAt?: Date | null;
}

export interface AccessTokenDatabaseRowV1 {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenDigest: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: string;
  readonly revokedAt?: Date | null;
}

export interface SessionUserDatabaseRowV1 {
  readonly id: string;
  readonly status: string;
  readonly securityEpoch: number;
  readonly mfaReenrollmentRequired: boolean;
}

export interface SessionMembershipDatabaseRowV1 {
  readonly id: string;
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly scopeType: string;
  readonly status: string;
}

export interface SessionWorkspaceDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly status: string;
}

export interface SessionOrganizationDatabaseRowV1 {
  readonly id: string;
  readonly status: string;
}

export interface SessionMfaFactorDatabaseRowV1 {
  readonly id: string;
}

interface SessionDelegateV1 {
  create(input: { readonly data: SessionRecordDatabaseRowV1 }): Promise<SessionRecordDatabaseRowV1>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<SessionRecordDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly SessionRecordDatabaseRowV1[]>;
  update(input: {
    readonly where: { readonly id: string };
    readonly data: Partial<SessionRecordDatabaseRowV1>;
  }): Promise<SessionRecordDatabaseRowV1>;
}

interface RefreshTokenDelegateV1 {
  create(input: { readonly data: RefreshTokenDatabaseRowV1 }): Promise<RefreshTokenDatabaseRowV1>;
  findUnique(input: {
    readonly where: { readonly tokenDigest: string };
  }): Promise<RefreshTokenDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly RefreshTokenDatabaseRowV1[]>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<RefreshTokenDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

interface AccessTokenDelegateV1 {
  create(input: { readonly data: AccessTokenDatabaseRowV1 }): Promise<AccessTokenDatabaseRowV1>;
  findUnique(input: {
    readonly where: { readonly tokenDigest: string };
  }): Promise<AccessTokenDatabaseRowV1 | null>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<AccessTokenDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

interface UniqueDelegateV1<TRow> {
  findUnique(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
}

interface ListDelegateV1<TRow> {
  findMany(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<readonly TRow[]>;
}

export interface SessionLifecycleDatabaseClientV1 {
  readonly sessionRecord: SessionDelegateV1;
  readonly refreshTokenRecord: RefreshTokenDelegateV1;
  readonly accessTokenRecord: AccessTokenDelegateV1;
  readonly userIdentity: UniqueDelegateV1<SessionUserDatabaseRowV1>;
  readonly membershipIdentity: ListDelegateV1<SessionMembershipDatabaseRowV1>;
  readonly workspaceIdentity: UniqueDelegateV1<SessionWorkspaceDatabaseRowV1>;
  readonly organizationIdentity: UniqueDelegateV1<SessionOrganizationDatabaseRowV1>;
  readonly mfaFactor: ListDelegateV1<SessionMfaFactorDatabaseRowV1>;
  $transaction<TValue>(
    work: (transaction: SessionLifecycleDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface SessionLifecycleAdapterOptionsV1 {
  readonly clock?: () => Date;
}

function stableIdentifier(input: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new Error('IAM_INVALID_IDENTIFIER');
  return parsed.value;
}

function timestamp(input: Date | null | undefined): StrictUtcTimestampV1 | undefined {
  if (!input) return undefined;
  const parsed = parseStrictUtcTimestampV1(input.toISOString());
  return parsed.accepted ? parsed.value : undefined;
}

function addSeconds(now: Date, seconds: number, upperBound?: string): string {
  const candidate = new Date(now.getTime() + seconds * 1_000);
  if (!upperBound || candidate.toISOString() <= upperBound) return candidate.toISOString();
  return upperBound;
}

function digestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

function tokenFor(tokenId: string): string {
  return `${tokenId}.${randomBytes(32).toString('base64url')}`;
}

function sessionFromRow(row: SessionRecordDatabaseRowV1): SessionRecordV1 {
  const sessionId = stableIdentifier(row.id);
  const userId = stableIdentifier(row.userId);
  const organizationId = stableIdentifier(row.organizationId);
  const workspaceId = stableIdentifier(row.workspaceId);
  const familyId = stableIdentifier(row.familyId);
  const issuedAt = timestamp(row.issuedAt);
  const accessExpiresAt = timestamp(row.accessExpiresAt);
  const inactivityExpiresAt = timestamp(row.inactivityExpiresAt);
  const absoluteExpiresAt = timestamp(row.absoluteExpiresAt);
  if (!issuedAt || !accessExpiresAt || !inactivityExpiresAt || !absoluteExpiresAt) {
    throw new Error('IAM_PERSISTED_SESSION_INVALID');
  }
  const issuedAtMs = Date.parse(issuedAt);
  const accessExpiresAtMs = Date.parse(accessExpiresAt);
  const inactivityExpiresAtMs = Date.parse(inactivityExpiresAt);
  const absoluteExpiresAtMs = Date.parse(absoluteExpiresAt);
  // Access expiry is deliberately slid on refresh. Its <=15-minute lifetime is
  // validated against the access-token row at issuance; comparing it with the
  // immutable session issuedAt would reject every normal refresh after 0ms.
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(accessExpiresAtMs) ||
    !Number.isFinite(inactivityExpiresAtMs) ||
    !Number.isFinite(absoluteExpiresAtMs) ||
    accessExpiresAtMs <= issuedAtMs ||
    accessExpiresAtMs > inactivityExpiresAtMs ||
    inactivityExpiresAtMs <= issuedAtMs ||
    inactivityExpiresAtMs > absoluteExpiresAtMs ||
    inactivityExpiresAtMs - issuedAtMs > 90 * 24 * 60 * 60 * 1_000 ||
    absoluteExpiresAtMs - issuedAtMs > 365 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error('IAM_PERSISTED_SESSION_INVALID');
  }
  const created = {
    schemaVersion: 1 as const,
    sessionId,
    userId,
    organizationId,
    workspaceId,
    familyId,
    issuedAt,
    accessExpiresAt,
    inactivityExpiresAt,
    absoluteExpiresAt,
  };
  if (row.status !== 'ACTIVE' && row.status !== 'REVOKED' && row.status !== 'EXPIRED')
    throw new Error('IAM_PERSISTED_SESSION_INVALID');
  return Object.freeze({ ...created, status: row.status });
}

function tokenFromRow(row: RefreshTokenDatabaseRowV1): {
  readonly id: StableIdentifierV1;
  readonly sessionId: StableIdentifierV1;
  readonly familyId: StableIdentifierV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly status: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
} {
  const id = stableIdentifier(row.id);
  const sessionId = stableIdentifier(row.sessionId);
  const familyId = stableIdentifier(row.familyId);
  const expiresAt = timestamp(row.expiresAt);
  if (!expiresAt || row.tokenDigest.length < 32 || row.tokenDigest.length > 128)
    throw new Error('IAM_PERSISTED_REFRESH_TOKEN_INVALID');
  if (
    row.status !== 'ACTIVE' &&
    row.status !== 'USED' &&
    row.status !== 'REVOKED' &&
    row.status !== 'EXPIRED'
  )
    throw new Error('IAM_PERSISTED_REFRESH_TOKEN_INVALID');
  return { id, sessionId, familyId, expiresAt, status: row.status };
}

function successfulSession(session: AuthenticationSessionV1): SessionRefreshResultV1 {
  return Object.freeze({ accepted: true, value: Object.freeze(session) });
}

/** PostgreSQL-backed, transactional session and refresh-token family lifecycle. */
export class PrismaSessionLifecycleAdapter implements SessionLifecyclePortV1 {
  private readonly clock: () => Date;

  public constructor(
    private readonly client: SessionLifecycleDatabaseClientV1,
    options: SessionLifecycleAdapterOptionsV1 = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  private async revokeSession(
    transaction: SessionLifecycleDatabaseClientV1,
    session: Pick<SessionRecordDatabaseRowV1, 'id' | 'familyId' | 'revokedAt'>,
    now: Date,
  ): Promise<void> {
    await transaction.refreshTokenRecord.updateMany({
      where: { familyId: session.familyId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    await transaction.sessionRecord.update({
      where: { id: session.id },
      data: { status: 'REVOKED', revokedAt: session.revokedAt ?? now },
    });
    await transaction.accessTokenRecord.updateMany({
      where: { sessionId: session.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });
  }

  private async revokeRefreshFamily(
    transaction: SessionLifecycleDatabaseClientV1,
    sessionId: StableIdentifierV1,
    familyId: StableIdentifierV1,
    now: Date,
  ): Promise<void> {
    await this.revokeSession(transaction, { id: sessionId, familyId }, now);
  }

  private async expireSession(
    transaction: SessionLifecycleDatabaseClientV1,
    sessionId: StableIdentifierV1,
    familyId: StableIdentifierV1,
  ): Promise<void> {
    await transaction.refreshTokenRecord.updateMany({
      where: { familyId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
    await transaction.sessionRecord.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });
    await transaction.accessTokenRecord.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
  }

  public async issue(
    principal: AuthenticatedPrincipalV1,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<AuthenticationSessionV1> {
    const policy = sessionPolicyForPlatformV1(clientPlatform);
    const now = this.clock();
    const sessionId = stableIdentifier(randomUUID());
    const familyId = stableIdentifier(randomUUID());
    const refreshTokenId = stableIdentifier(randomUUID());
    const created = createSessionRecordV1({
      sessionId,
      userId: principal.userId,
      organizationId: principal.organizationId,
      workspaceId: principal.workspaceId,
      familyId,
      issuedAt: now.toISOString(),
      accessExpiresAt: addSeconds(now, policy.accessTokenSeconds),
      inactivityExpiresAt: addSeconds(now, policy.inactivitySeconds),
      absoluteExpiresAt: addSeconds(now, policy.absoluteSeconds),
    });
    if (!created.accepted) throw new Error(`IAM_${created.code}`);
    const refreshToken = tokenFor(refreshTokenId);
    const accessTokenId = stableIdentifier(randomUUID());
    const accessToken = tokenFor(accessTokenId);
    const record = created.value;
    await this.client.$transaction(async (transaction) => {
      await transaction.sessionRecord.create({
        data: {
          id: record.sessionId,
          userId: record.userId,
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
          familyId: record.familyId,
          issuedAt: new Date(record.issuedAt),
          accessExpiresAt: new Date(record.accessExpiresAt),
          inactivityExpiresAt: new Date(record.inactivityExpiresAt),
          absoluteExpiresAt: new Date(record.absoluteExpiresAt),
          status: 'ACTIVE',
          revokedAt: null,
        },
      });
      await transaction.refreshTokenRecord.create({
        data: {
          id: refreshTokenId,
          sessionId: record.sessionId,
          familyId: record.familyId,
          tokenDigest: digestToken(refreshToken),
          status: 'ACTIVE',
          issuedAt: new Date(record.issuedAt),
          expiresAt: new Date(record.absoluteExpiresAt),
          usedAt: null,
        },
      });
      await transaction.accessTokenRecord.create({
        data: {
          id: accessTokenId,
          sessionId: record.sessionId,
          tokenDigest: digestToken(accessToken),
          issuedAt: new Date(record.issuedAt),
          expiresAt: new Date(record.accessExpiresAt),
          status: 'ACTIVE',
          revokedAt: null,
        },
      });
    });
    return {
      sessionId: record.sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: record.accessExpiresAt,
      refreshExpiresAt: record.absoluteExpiresAt,
    };
  }

  public async refresh(
    refreshTokenInput: unknown,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<SessionRefreshResultV1> {
    const policy = sessionPolicyForPlatformV1(clientPlatform);
    if (typeof refreshTokenInput !== 'string' || refreshTokenInput.length < 80)
      return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
    const digest = digestToken(refreshTokenInput);
    const now = this.clock();
    return this.client.$transaction(async (transaction) => {
      const persisted = await transaction.refreshTokenRecord.findUnique({
        where: { tokenDigest: digest },
      });
      if (!persisted) return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
      const token = tokenFromRow(persisted);
      const sessionRow = await transaction.sessionRecord.findUnique({
        where: { id: token.sessionId },
      });
      if (!sessionRow) return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
      const session = sessionFromRow(sessionRow);
      if (session.status === 'REVOKED') return { accepted: false, code: 'REVOKED_FAMILY' };
      if (session.status === 'EXPIRED') return { accepted: false, code: 'EXPIRED' };
      if (
        now.getTime() >= Date.parse(session.inactivityExpiresAt) ||
        now.getTime() >= Date.parse(session.absoluteExpiresAt)
      ) {
        await this.expireSession(transaction, token.sessionId, token.familyId);
        return { accepted: false, code: 'EXPIRED' };
      }
      const active = await transaction.refreshTokenRecord.findMany({
        where: { sessionId: token.sessionId, familyId: token.familyId, status: 'ACTIVE' },
        orderBy: { issuedAt: 'desc' },
      });
      if (active.length !== 1 || !active[0]) {
        await this.revokeRefreshFamily(transaction, token.sessionId, token.familyId, now);
        return { accepted: false, code: 'REUSE_DETECTED' };
      }
      const activeToken = tokenFromRow(active[0]);
      const rotated = rotateRefreshFamilyV1({
        now: now.toISOString(),
        presentedTokenId: token.id,
        activeTokenId: activeToken.id,
        nextTokenId: stableIdentifier(randomUUID()),
        familyStatus: session.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
        tokenExpiresAt: token.expiresAt,
      });
      if (!rotated.accepted || !rotated.nextTokenId) {
        if (rotated.code === 'REUSE_DETECTED') {
          await this.revokeRefreshFamily(transaction, token.sessionId, token.familyId, now);
        } else if (rotated.code === 'EXPIRED' && token.status === 'ACTIVE') {
          await transaction.refreshTokenRecord.updateMany({
            where: { id: token.id, status: 'ACTIVE' },
            data: { status: 'EXPIRED' },
          });
        }
        const failureCode: SessionRefreshFailureCodeV1 =
          rotated.code === 'EXPIRED'
            ? 'EXPIRED'
            : rotated.code === 'REUSE_DETECTED'
              ? 'REUSE_DETECTED'
              : 'REVOKED_FAMILY';
        return {
          accepted: false,
          code: failureCode,
        };
      }
      const consumed = await transaction.refreshTokenRecord.updateMany({
        where: { id: token.id, status: 'ACTIVE' },
        data: { status: 'USED', usedAt: now },
      });
      if (consumed.count !== 1) return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
      const accessExpiresAt = addSeconds(now, policy.accessTokenSeconds, session.absoluteExpiresAt);
      const inactivityExpiresAt = addSeconds(
        now,
        policy.inactivitySeconds,
        session.absoluteExpiresAt,
      );
      await transaction.sessionRecord.update({
        where: { id: session.sessionId },
        data: {
          accessExpiresAt: new Date(accessExpiresAt),
          inactivityExpiresAt: new Date(inactivityExpiresAt),
        },
      });
      const nextRefreshToken = tokenFor(rotated.nextTokenId);
      const nextAccessTokenId = stableIdentifier(randomUUID());
      const nextAccessToken = tokenFor(nextAccessTokenId);
      await transaction.refreshTokenRecord.create({
        data: {
          id: rotated.nextTokenId,
          sessionId: session.sessionId,
          familyId: session.familyId,
          tokenDigest: digestToken(nextRefreshToken),
          status: 'ACTIVE',
          issuedAt: now,
          expiresAt: new Date(session.absoluteExpiresAt),
          usedAt: null,
        },
      });
      await transaction.accessTokenRecord.create({
        data: {
          id: nextAccessTokenId,
          sessionId: session.sessionId,
          tokenDigest: digestToken(nextAccessToken),
          issuedAt: now,
          expiresAt: new Date(accessExpiresAt),
          status: 'ACTIVE',
          revokedAt: null,
        },
      });
      return successfulSession({
        sessionId: session.sessionId,
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        accessExpiresAt,
        refreshExpiresAt: session.absoluteExpiresAt,
      });
    });
  }

  public async revoke(sessionIdInput: unknown): Promise<boolean> {
    if (typeof sessionIdInput !== 'string') return false;
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return false;
    const now = this.clock();
    return this.client.$transaction(async (transaction) => {
      const session = await transaction.sessionRecord.findUnique({
        where: { id: sessionId.value },
      });
      if (!session) return false;
      await this.revokeSession(transaction, session, now);
      return true;
    });
  }

  public async revokeAllForUser(userIdInput: unknown): Promise<number> {
    if (typeof userIdInput !== 'string') return 0;
    const userId = parseStableIdentifierV1(userIdInput);
    if (!userId.accepted) return 0;
    const now = this.clock();
    return this.client.$transaction(async (transaction) => {
      const sessions = await transaction.sessionRecord.findMany({
        where: { userId: userId.value, status: 'ACTIVE' },
      });
      for (const session of sessions) {
        await this.revokeSession(transaction, session, now);
      }
      return sessions.length;
    });
  }

  public async findPrincipalByAccessToken(
    accessTokenInput: unknown,
  ): Promise<AuthenticatedPrincipalV1 | undefined> {
    if (typeof accessTokenInput !== 'string' || accessTokenInput.length < 80) return undefined;
    const row = await this.client.accessTokenRecord.findUnique({
      where: { tokenDigest: digestToken(accessTokenInput) },
    });
    if (!row || row.status !== 'ACTIVE' || row.expiresAt.getTime() <= this.clock().getTime())
      return undefined;
    return this.findPrincipal(row.sessionId);
  }

  public async findPrincipal(
    sessionIdInput: unknown,
  ): Promise<AuthenticatedPrincipalV1 | undefined> {
    if (typeof sessionIdInput !== 'string') return undefined;
    const parsed = parseStableIdentifierV1(sessionIdInput);
    if (!parsed.accepted) return undefined;
    const sessionRow = await this.client.sessionRecord.findUnique({
      where: { id: parsed.value },
    });
    if (!sessionRow) return undefined;
    const session = sessionFromRow(sessionRow);
    const now = Date.parse(this.clock().toISOString());
    if (
      session.status !== 'ACTIVE' ||
      now >= Date.parse(session.inactivityExpiresAt) ||
      now >= Date.parse(session.absoluteExpiresAt)
    )
      return undefined;
    const user = await this.client.userIdentity.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE' || user.id !== session.userId) return undefined;
    if (!Number.isSafeInteger(user.securityEpoch) || user.securityEpoch < 1) return undefined;
    const memberships = await this.client.membershipIdentity.findMany({
      where: {
        principalId: session.userId,
        organizationId: session.organizationId,
        status: 'ACTIVE',
      },
    });
    const membership = memberships.find(
      (candidate) =>
        candidate.principalId === session.userId &&
        candidate.organizationId === session.organizationId &&
        candidate.projectId === null &&
        ((candidate.scopeType === 'ORGANIZATION' && candidate.workspaceId === null) ||
          (candidate.scopeType === 'WORKSPACE' && candidate.workspaceId === session.workspaceId)),
    );
    if (!membership) return undefined;
    const organizationId = parseStableIdentifierV1(session.organizationId);
    const workspaceId = parseStableIdentifierV1(session.workspaceId);
    if (!organizationId.accepted || !workspaceId.accepted) return undefined;
    const [organization, workspace, factors] = await Promise.all([
      this.client.organizationIdentity.findUnique({ where: { id: organizationId.value } }),
      this.client.workspaceIdentity.findUnique({ where: { id: workspaceId.value } }),
      this.client.mfaFactor.findMany({ where: { userId: session.userId, status: 'ACTIVE' } }),
    ]);
    if (
      !organization ||
      organization.id !== organizationId.value ||
      organization.status !== 'ACTIVE' ||
      !workspace ||
      workspace.id !== workspaceId.value ||
      workspace.organizationId !== organizationId.value ||
      workspace.status !== 'ACTIVE'
    )
      return undefined;
    return Object.freeze({
      userId: session.userId,
      organizationId: organizationId.value,
      workspaceId: workspaceId.value,
      securityEpoch: user.securityEpoch,
      mfaRequired: factors.length > 0,
      mfaReenrollmentRequired: user.mfaReenrollmentRequired,
    });
  }
}

export const asSessionIssuerPortV1 = (
  adapter: PrismaSessionLifecycleAdapter,
): SessionIssuerPortV1 => adapter;
