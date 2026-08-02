import type {
  AuthenticationSessionV1,
  AuthenticatedPrincipalV1,
  SessionIssuerPortV1,
} from './authentication.port.js';

export const SESSION_LIFECYCLE_PORT = Symbol('SESSION_LIFECYCLE_PORT');

export type SessionRefreshFailureCodeV1 =
  | 'INVALID_REFRESH_TOKEN'
  | 'REUSE_DETECTED'
  | 'REVOKED_FAMILY'
  | 'EXPIRED';

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
  refresh(
    refreshToken: unknown,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<SessionRefreshResultV1>;
  revoke(sessionId: unknown): Promise<boolean>;
  findPrincipal(sessionId: unknown): Promise<AuthenticatedPrincipalV1 | undefined>;
}
