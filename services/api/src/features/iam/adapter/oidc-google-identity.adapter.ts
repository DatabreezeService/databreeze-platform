import type {
  OidcIdentityPortV1,
  OidcVerifyResultV1,
  OidcVerifiedIdentityV1,
} from '../application/oidc-identity.port.js';

export interface GoogleOidcIdentityAdapterOptionsV1 {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuer?: string;
  /** Injected verifier for tests; production wires token endpoint + ID token validation. */
  readonly verify?: (input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
    readonly nonce: string;
  }) => Promise<OidcVerifiedIdentityV1>;
}

/** Google OIDC adapter: never returns provider access tokens to clients. */
export class OidcGoogleIdentityAdapter implements OidcIdentityPortV1 {
  private readonly issuer: string;

  public constructor(private readonly options: GoogleOidcIdentityAdapterOptionsV1) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error('IAM_OIDC_GOOGLE_CLIENT_REQUIRED');
    }
    this.issuer = options.issuer ?? 'https://accounts.google.com';
  }

  public async verifyAuthorizationCode(input: {
    readonly code: unknown;
    readonly codeVerifier: unknown;
    readonly redirectUri: unknown;
    readonly nonce: unknown;
  }): Promise<OidcVerifyResultV1> {
    const code = typeof input.code === 'string' && input.code.length > 0 ? input.code : undefined;
    const codeVerifier =
      typeof input.codeVerifier === 'string' && input.codeVerifier.length >= 43
        ? input.codeVerifier
        : undefined;
    const redirectUri =
      typeof input.redirectUri === 'string' && input.redirectUri.startsWith('https://')
        ? input.redirectUri
        : undefined;
    const nonce =
      typeof input.nonce === 'string' && input.nonce.length >= 16 ? input.nonce : undefined;
    if (!code || !codeVerifier || !redirectUri || !nonce) {
      return { accepted: false, code: 'INVALID_INPUT' };
    }
    if (!this.options.verify) {
      return { accepted: false, code: 'OIDC_UNAVAILABLE' };
    }
    try {
      const verified = await this.options.verify({
        code,
        codeVerifier,
        redirectUri,
        nonce,
      });
      if (!verified.emailVerified) return { accepted: false, code: 'EMAIL_UNVERIFIED' };
      if (verified.issuer !== this.issuer) return { accepted: false, code: 'INVALID_TOKEN' };
      return {
        accepted: true,
        value: Object.freeze({
          issuer: verified.issuer,
          subject: verified.subject,
          email: verified.email,
          emailVerified: verified.emailVerified,
          authenticatedAt: verified.authenticatedAt,
        }),
      };
    } catch {
      return { accepted: false, code: 'INVALID_TOKEN' };
    }
  }
}
