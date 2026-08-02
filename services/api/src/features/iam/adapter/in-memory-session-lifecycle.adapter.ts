import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  createSessionRecordV1,
  rotateRefreshFamilyV1,
  type SessionRecordV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
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
  SessionRefreshResultV1,
} from '../application/session-lifecycle.port.js';

interface SessionEntryV1 {
  readonly record: SessionRecordV1;
  readonly principal: AuthenticatedPrincipalV1;
  activeTokenId: StableIdentifierV1;
  familyStatus: 'ACTIVE' | 'REVOKED';
}

interface RefreshEntryV1 {
  readonly tokenId: StableIdentifierV1;
  readonly sessionId: StableIdentifierV1;
  readonly familyId: StableIdentifierV1;
  readonly expiresAt: StrictUtcTimestampV1;
  status: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
}

export interface SessionLifecycleAdapterOptionsV1 {
  readonly clock?: () => Date;
}

const ACCESS_TOKEN_SECONDS_V1 = 15 * 60;
const INACTIVITY_SECONDS_V1 = 60 * 60;
const ABSOLUTE_SECONDS_V1 = 30 * 24 * 60 * 60;

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function digestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

function stableIdentifier(input: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new Error('IAM_INVALID_IDENTIFIER');
  return parsed.value;
}

function tokenFor(tokenId: StableIdentifierV1): string {
  return `${tokenId}.${randomBytes(32).toString('base64url')}`;
}

function acceptedSession(session: AuthenticationSessionV1): SessionRefreshResultV1 {
  return Object.freeze({ accepted: true, value: Object.freeze(session) });
}

/** Local session store for alpha/runtime composition; the same lifecycle maps to IAM tables later. */
export class InMemorySessionLifecycleAdapter implements SessionLifecyclePortV1 {
  private readonly clock: () => Date;
  private readonly sessions = new Map<string, SessionEntryV1>();
  private readonly refreshTokens = new Map<string, RefreshEntryV1>();
  private readonly accessTokens = new Map<string, string>();

  public constructor(options: SessionLifecycleAdapterOptionsV1 = {}) {
    this.clock = options.clock ?? (() => new Date());
  }

  public issue(
    principal: AuthenticatedPrincipalV1,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<AuthenticationSessionV1> {
    void clientPlatform;
    const now = this.clock();
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const activeTokenId = randomUUID();
    const sessionIdentifier = stableIdentifier(sessionId);
    const familyIdentifier = stableIdentifier(familyId);
    const activeTokenIdentifier = stableIdentifier(activeTokenId);
    const created = createSessionRecordV1({
      sessionId: sessionIdentifier,
      userId: principal.userId,
      familyId: familyIdentifier,
      issuedAt: now.toISOString(),
      accessExpiresAt: addSeconds(now, ACCESS_TOKEN_SECONDS_V1),
      inactivityExpiresAt: addSeconds(now, INACTIVITY_SECONDS_V1),
      absoluteExpiresAt: addSeconds(now, ABSOLUTE_SECONDS_V1),
    });
    if (!created.accepted) return Promise.reject(new Error(`IAM_${created.code}`));
    const refreshToken = tokenFor(activeTokenIdentifier);
    const accessToken = tokenFor(stableIdentifier(randomUUID()));
    this.sessions.set(sessionId, {
      record: created.value,
      principal: Object.freeze({ ...principal }),
      activeTokenId: activeTokenIdentifier,
      familyStatus: 'ACTIVE',
    });
    this.refreshTokens.set(digestToken(refreshToken), {
      tokenId: activeTokenIdentifier,
      sessionId: sessionIdentifier,
      familyId: familyIdentifier,
      expiresAt: created.value.absoluteExpiresAt,
      status: 'ACTIVE',
    });
    this.accessTokens.set(digestToken(accessToken), sessionId);
    return Promise.resolve({
      sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: created.value.accessExpiresAt,
    });
  }

  public async refresh(
    refreshTokenInput: unknown,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<SessionRefreshResultV1> {
    void clientPlatform;
    await Promise.resolve();
    if (typeof refreshTokenInput !== 'string' || refreshTokenInput.length < 80)
      return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
    const token = this.refreshTokens.get(digestToken(refreshTokenInput));
    if (!token) return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
    const session = this.sessions.get(token.sessionId);
    if (!session) return { accepted: false, code: 'INVALID_REFRESH_TOKEN' };
    const now = this.clock().toISOString();
    const nextTokenId = stableIdentifier(randomUUID());
    const rotated = rotateRefreshFamilyV1({
      now,
      presentedTokenId: token.tokenId,
      activeTokenId: session.activeTokenId,
      nextTokenId,
      familyStatus: session.familyStatus,
      tokenExpiresAt: token.expiresAt,
    });
    if (!rotated.accepted) {
      if (rotated.code === 'REUSE_DETECTED') {
        this.revokeFamily(token.familyId);
      } else if (rotated.code === 'EXPIRED') {
        token.status = 'EXPIRED';
      }
      return {
        accepted: false,
        code: rotated.code === 'ROTATED' ? 'INVALID_REFRESH_TOKEN' : rotated.code,
      };
    }
    token.status = 'USED';
    session.activeTokenId = nextTokenId;
    const nextRefreshToken = tokenFor(nextTokenId);
    const nextAccessToken = tokenFor(stableIdentifier(randomUUID()));
    this.refreshTokens.set(digestToken(nextRefreshToken), {
      tokenId: nextTokenId,
      sessionId: session.record.sessionId,
      familyId: token.familyId,
      expiresAt: session.record.absoluteExpiresAt,
      status: 'ACTIVE',
    });
    this.accessTokens.set(digestToken(nextAccessToken), token.sessionId);
    return acceptedSession({
      sessionId: session.record.sessionId,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      accessExpiresAt: addSeconds(this.clock(), ACCESS_TOKEN_SECONDS_V1),
    });
  }

  public async revoke(sessionIdInput: unknown): Promise<boolean> {
    await Promise.resolve();
    if (typeof sessionIdInput !== 'string') return false;
    const session = this.sessions.get(sessionIdInput);
    if (!session) return false;
    this.revokeFamily(session.record.familyId);
    return true;
  }

  public async findPrincipal(
    sessionIdInput: unknown,
  ): Promise<AuthenticatedPrincipalV1 | undefined> {
    await Promise.resolve();
    if (typeof sessionIdInput !== 'string') return undefined;
    const session = this.sessions.get(sessionIdInput);
    if (!session || session.familyStatus !== 'ACTIVE') return undefined;
    return session.principal;
  }

  public async findPrincipalByAccessToken(
    accessTokenInput: unknown,
  ): Promise<AuthenticatedPrincipalV1 | undefined> {
    await Promise.resolve();
    if (typeof accessTokenInput !== 'string' || accessTokenInput.length < 80) return undefined;
    const sessionId = this.accessTokens.get(digestToken(accessTokenInput));
    return sessionId === undefined ? undefined : this.findPrincipal(sessionId);
  }

  private revokeFamily(familyId: StableIdentifierV1): void {
    for (const session of this.sessions.values()) {
      if (session.record.familyId === familyId) session.familyStatus = 'REVOKED';
    }
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === familyId && token.status === 'ACTIVE') token.status = 'REVOKED';
    }
  }
}

export const asSessionIssuerPortV1 = (
  adapter: InMemorySessionLifecycleAdapter,
): SessionIssuerPortV1 => adapter;
