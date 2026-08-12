export const OIDC_IDENTITY_PORT = Symbol('OIDC_IDENTITY_PORT');

export interface OidcVerifiedIdentityV1 {
  readonly issuer: string;
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly authenticatedAt: string;
}

export type OidcIdentityFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'INVALID_TOKEN'
  | 'EMAIL_UNVERIFIED'
  | 'OIDC_UNAVAILABLE';

export type OidcVerifyResultV1 =
  | { readonly accepted: true; readonly value: OidcVerifiedIdentityV1 }
  | { readonly accepted: false; readonly code: OidcIdentityFailureCodeV1 };

export interface OidcIdentityPortV1 {
  verifyAuthorizationCode(input: {
    readonly code: unknown;
    readonly codeVerifier: unknown;
    readonly redirectUri: unknown;
    readonly nonce: unknown;
  }): Promise<OidcVerifyResultV1>;
}
