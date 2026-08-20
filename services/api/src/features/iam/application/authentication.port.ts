import type { PasswordCredentialService } from './password-credential.service.js';

export const AUTHENTICATION_PORT = Symbol('AUTHENTICATION_PORT');
export const AUTHENTICATION_USE_CASE = Symbol('AUTHENTICATION_USE_CASE');
export const CREDENTIAL_LOOKUP_PORT = Symbol('CREDENTIAL_LOOKUP_PORT');

export interface AuthenticatedPrincipalV1 {
  readonly scopeType?: 'TENANT';
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly securityEpoch: number;
  readonly mfaRequired: boolean;
  /** Recovery keeps this gate live until a new factor is verified. */
  readonly mfaReenrollmentRequired: boolean;
}

export interface PlatformAuthenticatedPrincipalV1 {
  readonly scopeType: 'PLATFORM';
  readonly userId: string;
  readonly securityEpoch: number;
  readonly mfaRequired: boolean;
  readonly mfaReenrollmentRequired: boolean;
}

export type SessionPrincipalV1 = AuthenticatedPrincipalV1 | PlatformAuthenticatedPrincipalV1;

export function isPlatformPrincipalV1(
  principal: SessionPrincipalV1,
): principal is PlatformAuthenticatedPrincipalV1 {
  return principal.scopeType === 'PLATFORM';
}

export interface CredentialLookupPortV1 {
  findCredential(email: string): Promise<
    | {
        readonly principal: SessionPrincipalV1;
        readonly credential: { readonly algorithm: 'argon2id'; readonly encodedHash: string };
      }
    | undefined
  >;
}

export interface SessionIssuerPortV1 {
  issue(
    principal: SessionPrincipalV1,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<{
    readonly sessionId: string;
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessExpiresAt: string;
    readonly refreshExpiresAt?: string;
  }>;
}

export interface AuthenticationInputV1 {
  readonly email: unknown;
  readonly password: unknown;
  readonly clientPlatform: 'android' | 'desktop' | 'web';
}

export type AuthenticationFailureCodeV1 = 'INVALID_CREDENTIALS' | 'AUTHENTICATION_UNAVAILABLE';

export interface AuthenticationSessionV1 {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt?: string;
}

export interface AuthenticationValueV1 {
  readonly principal: SessionPrincipalV1;
  readonly session: AuthenticationSessionV1;
}

export type AuthenticationResultV1 =
  | { readonly accepted: true; readonly value: AuthenticationValueV1 }
  | { readonly accepted: false; readonly code: AuthenticationFailureCodeV1 };

export interface AuthenticationUseCaseV1 {
  signIn(input: AuthenticationInputV1): Promise<AuthenticationResultV1>;
}

export interface AuthenticationPortV1 {
  readonly passwordCredentials: PasswordCredentialService;
  readonly credentials: CredentialLookupPortV1;
  readonly sessions: SessionIssuerPortV1;
}
