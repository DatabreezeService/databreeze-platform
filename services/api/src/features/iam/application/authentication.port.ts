import type { PasswordCredentialService } from './password-credential.service.js';

export const AUTHENTICATION_PORT = Symbol('AUTHENTICATION_PORT');

export interface AuthenticatedPrincipalV1 {
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly securityEpoch: number;
  readonly mfaRequired: boolean;
}

export interface CredentialLookupPortV1 {
  findCredential(email: string): Promise<
    | {
        readonly principal: AuthenticatedPrincipalV1;
        readonly credential: { readonly algorithm: 'argon2id'; readonly encodedHash: string };
      }
    | undefined
  >;
}

export interface SessionIssuerPortV1 {
  issue(
    principal: AuthenticatedPrincipalV1,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<{
    readonly sessionId: string;
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessExpiresAt: string;
  }>;
}

export interface AuthenticationPortV1 {
  readonly passwordCredentials: PasswordCredentialService;
  readonly credentials: CredentialLookupPortV1;
  readonly sessions: SessionIssuerPortV1;
}
