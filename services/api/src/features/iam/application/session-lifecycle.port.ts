import type {
  AuthenticationSessionV1,
  AuthenticatedPrincipalV1,
  SessionPrincipalV1,
  SessionIssuerPortV1,
} from './authentication.port.js';

export const SESSION_LIFECYCLE_PORT = Symbol('SESSION_LIFECYCLE_PORT');
export const SESSION_ACCESS_TOKEN_LOOKUP_PORT = Symbol('SESSION_ACCESS_TOKEN_LOOKUP_PORT');

export type SessionRefreshFailureCodeV1 =
  | 'INVALID_REFRESH_TOKEN'
  | 'REUSE_DETECTED'
  | 'REVOKED_FAMILY'
  | 'EXPIRED';

export type SessionScopeSwitchResultV1 =
  | { readonly accepted: true; readonly value: AuthenticationSessionV1 }
  | { readonly accepted: false; readonly code: 'INVALID_SESSION' | 'UNAVAILABLE' };

export type SessionRefreshResultV1 =
  | {
      readonly accepted: true;
      readonly value: AuthenticationSessionV1;
    }
  | {
      readonly accepted: false;
      readonly code: SessionRefreshFailureCodeV1;
    };

export interface SessionLifecyclePortV1 extends SessionIssuerPortV1 {
  /** Atomically replaces a live session with a new workspace-scoped session. */
  switchScope?(
    currentSessionId: unknown,
    principal: AuthenticatedPrincipalV1,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<SessionScopeSwitchResultV1>;
  refresh(
    refreshToken: unknown,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<SessionRefreshResultV1>;
  revoke(sessionId: unknown): Promise<boolean>;
  /** Revokes every active refresh family for the user. Returns revoked session count. */
  revokeAllForUser?(userId: unknown): Promise<number>;
  findPrincipal(sessionId: unknown): Promise<SessionPrincipalV1 | undefined>;
  findSessionByAccessToken?(
    accessToken: unknown,
  ): Promise<{ readonly sessionId: string; readonly principal: SessionPrincipalV1 } | undefined>;
  /** Optional until a host enables authenticated request-context resolution. */
  findPrincipalByAccessToken?(accessToken: unknown): Promise<SessionPrincipalV1 | undefined>;
}

export interface SessionAccessTokenLookupPortV1 {
  findPrincipalByAccessToken(accessToken: unknown): Promise<SessionPrincipalV1 | undefined>;
}
