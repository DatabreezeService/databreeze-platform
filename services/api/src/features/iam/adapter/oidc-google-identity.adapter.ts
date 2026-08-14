import {
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type JsonWebKey,
} from 'node:crypto';

import type {
  OidcIdentityPortV1,
  OidcVerifyResultV1,
  OidcVerifiedIdentityV1,
} from '../application/oidc-identity.port.js';

type GoogleOidcFetchV1 = (url: string, init?: RequestInit) => Promise<Response>;

export interface GoogleOidcIdentityAdapterOptionsV1 {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuer?: string;
  /** Exact callback allowlist. Required by the built-in production verifier. */
  readonly approvedRedirectUris?: readonly string[];
  readonly fetch?: GoogleOidcFetchV1;
  readonly clock?: () => Date;
  readonly maxAuthenticationAgeSeconds?: number;
  /** Test seam only. Production should use the built-in exchange and signature verifier. */
  readonly verify?: (input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
    readonly nonce: string;
  }) => Promise<OidcVerifiedIdentityV1>;
}

interface GoogleJwkV1 extends Record<string, unknown> {
  readonly kid: string;
  readonly kty: 'RSA';
  readonly alg?: 'RS256';
  readonly use?: 'sig';
  readonly n: string;
  readonly e: string;
}

interface GoogleIdTokenClaimsV1 extends Record<string, unknown> {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly azp?: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly nonce: string;
  readonly iat: number;
  readonly exp: number;
  readonly auth_time: number;
}

const GOOGLE_TOKEN_ENDPOINT_V1 = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI_V1 = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_LEGACY_ISSUER_V1 = 'accounts.google.com';
const CLOCK_SKEW_SECONDS_V1 = 60;
const DEFAULT_MAX_AUTHENTICATION_AGE_SECONDS_V1 = 3_600;

function boundedString(value: unknown, minimum: number, maximum: number): string | undefined {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum
    ? value
    : undefined;
}

function exactString(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function decodeJwtObject(segment: string): Readonly<Record<string, unknown>> | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment) || segment.length > 16_384) return undefined;
  try {
    return jsonObject(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown);
  } catch {
    return undefined;
  }
}

function googleJwk(value: unknown): GoogleJwkV1 | undefined {
  const candidate = jsonObject(value);
  if (
    !candidate ||
    candidate['kty'] !== 'RSA' ||
    (candidate['alg'] !== undefined && candidate['alg'] !== 'RS256') ||
    (candidate['use'] !== undefined && candidate['use'] !== 'sig')
  )
    return undefined;
  const kid = boundedString(candidate['kid'], 1, 256);
  const n = boundedString(candidate['n'], 32, 2_048);
  const e = boundedString(candidate['e'], 1, 32);
  return kid && n && e
    ? Object.freeze({ kid, kty: 'RSA' as const, n, e, alg: 'RS256' as const, use: 'sig' as const })
    : undefined;
}

function maxAgeMilliseconds(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/iu);
  const seconds = match?.[1] === undefined ? 300 : Number(match[1]);
  return Math.min(Math.max(Number.isSafeInteger(seconds) ? seconds : 300, 60), 86_400) * 1_000;
}

/** Google OIDC adapter: never returns provider access tokens to clients. */
export class OidcGoogleIdentityAdapter implements OidcIdentityPortV1 {
  private readonly issuer: string;
  private readonly approvedRedirectUris: ReadonlySet<string>;
  private readonly providerFetch: GoogleOidcFetchV1;
  private readonly clock: () => Date;
  private readonly maxAuthenticationAgeSeconds: number;
  private cachedKeys?: { readonly expiresAt: number; readonly keys: readonly GoogleJwkV1[] };

  public constructor(private readonly options: GoogleOidcIdentityAdapterOptionsV1) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error('IAM_OIDC_GOOGLE_CLIENT_REQUIRED');
    }
    this.issuer = options.issuer ?? 'https://accounts.google.com';
    this.approvedRedirectUris = new Set(options.approvedRedirectUris ?? []);
    if (!options.verify && this.approvedRedirectUris.size === 0) {
      throw new Error('IAM_OIDC_GOOGLE_REDIRECTS_REQUIRED');
    }
    this.providerFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.clock = options.clock ?? (() => new Date());
    this.maxAuthenticationAgeSeconds =
      options.maxAuthenticationAgeSeconds ?? DEFAULT_MAX_AUTHENTICATION_AGE_SECONDS_V1;
    if (
      !Number.isSafeInteger(this.maxAuthenticationAgeSeconds) ||
      this.maxAuthenticationAgeSeconds < 60 ||
      this.maxAuthenticationAgeSeconds > 86_400
    ) {
      throw new Error('IAM_OIDC_GOOGLE_AUTH_AGE_INVALID');
    }
  }

  public async verifyAuthorizationCode(input: {
    readonly code: unknown;
    readonly codeVerifier: unknown;
    readonly redirectUri: unknown;
    readonly nonce: unknown;
  }): Promise<OidcVerifyResultV1> {
    const code = boundedString(input.code, 1, 4_096);
    const codeVerifier =
      typeof input.codeVerifier === 'string' &&
      /^[A-Za-z0-9._~-]{43,128}$/u.test(input.codeVerifier)
        ? input.codeVerifier
        : undefined;
    const redirectUri =
      typeof input.redirectUri === 'string' &&
      input.redirectUri.startsWith('https://') &&
      input.redirectUri.length <= 2_048 &&
      (this.approvedRedirectUris.size === 0 || this.approvedRedirectUris.has(input.redirectUri))
        ? input.redirectUri
        : undefined;
    const nonce =
      typeof input.nonce === 'string' && /^[A-Za-z0-9._~-]{16,256}$/u.test(input.nonce)
        ? input.nonce
        : undefined;
    if (!code || !codeVerifier || !redirectUri || !nonce) {
      return { accepted: false, code: 'INVALID_INPUT' };
    }
    if (!this.options.verify)
      return this.verifyWithGoogle({ code, codeVerifier, redirectUri, nonce });
    try {
      const verified = await this.options.verify({
        code,
        codeVerifier,
        redirectUri,
        nonce,
      });
      if (!verified.emailVerified) return { accepted: false, code: 'EMAIL_UNVERIFIED' };
      if (verified.issuer !== this.issuer) return { accepted: false, code: 'INVALID_TOKEN' };
      if (
        !boundedString(verified.subject, 1, 255) ||
        !boundedString(verified.email, 3, 254) ||
        !Number.isFinite(Date.parse(verified.authenticatedAt))
      )
        return { accepted: false, code: 'INVALID_TOKEN' };
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

  private async verifyWithGoogle(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
    readonly nonce: string;
  }): Promise<OidcVerifyResultV1> {
    let response: Response;
    try {
      const body = new URLSearchParams({
        code: input.code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: input.codeVerifier,
      });
      response = await this.providerFetch(GOOGLE_TOKEN_ENDPOINT_V1, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { accepted: false, code: 'OIDC_UNAVAILABLE' };
    }
    if (!response.ok) {
      return {
        accepted: false,
        code: response.status >= 500 ? 'OIDC_UNAVAILABLE' : 'INVALID_TOKEN',
      };
    }
    let payload: Readonly<Record<string, unknown>> | undefined;
    try {
      payload = jsonObject(await response.json());
    } catch {
      return { accepted: false, code: 'INVALID_TOKEN' };
    }
    const idToken = boundedString(payload?.['id_token'], 32, 32_768);
    if (!idToken) return { accepted: false, code: 'INVALID_TOKEN' };
    return this.verifyIdToken(idToken, input.nonce);
  }

  private async verifyIdToken(idToken: string, expectedNonce: string): Promise<OidcVerifyResultV1> {
    const segments = idToken.split('.');
    if (segments.length !== 3) return { accepted: false, code: 'INVALID_TOKEN' };
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    if (!encodedHeader || !encodedPayload || !encodedSignature)
      return { accepted: false, code: 'INVALID_TOKEN' };
    const header = decodeJwtObject(encodedHeader);
    const claims = decodeJwtObject(encodedPayload);
    const kid = boundedString(header?.['kid'], 1, 256);
    if (
      !header ||
      header['alg'] !== 'RS256' ||
      (header['typ'] !== undefined && header['typ'] !== 'JWT') ||
      !kid ||
      !claims
    )
      return { accepted: false, code: 'INVALID_TOKEN' };
    let key: GoogleJwkV1 | undefined;
    try {
      key = await this.keyForId(kid);
    } catch {
      return { accepted: false, code: 'OIDC_UNAVAILABLE' };
    }
    if (!key) return { accepted: false, code: 'INVALID_TOKEN' };
    let signature: Buffer;
    try {
      signature = Buffer.from(encodedSignature, 'base64url');
    } catch {
      return { accepted: false, code: 'INVALID_TOKEN' };
    }
    const verified = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
      createPublicKey({ key: key as JsonWebKey, format: 'jwk' }),
      signature,
    );
    if (!verified) return { accepted: false, code: 'INVALID_TOKEN' };
    return this.validatedClaims(claims, expectedNonce);
  }

  private validatedClaims(
    raw: Readonly<Record<string, unknown>>,
    expectedNonce: string,
  ): OidcVerifyResultV1 {
    const issuer = boundedString(raw['iss'], 1, 256);
    const subject = boundedString(raw['sub'], 1, 255);
    const audience = boundedString(raw['aud'], 1, 512);
    const authorizedPresenter =
      raw['azp'] === undefined ? undefined : boundedString(raw['azp'], 1, 512);
    const email = boundedString(raw['email'], 3, 254);
    const nonce = boundedString(raw['nonce'], 16, 256);
    const iat =
      typeof raw['iat'] === 'number' && Number.isSafeInteger(raw['iat']) ? raw['iat'] : undefined;
    const exp =
      typeof raw['exp'] === 'number' && Number.isSafeInteger(raw['exp']) ? raw['exp'] : undefined;
    const authTime =
      typeof raw['auth_time'] === 'number' && Number.isSafeInteger(raw['auth_time'])
        ? raw['auth_time']
        : undefined;
    if (
      !issuer ||
      (issuer !== this.issuer && issuer !== GOOGLE_LEGACY_ISSUER_V1) ||
      !subject ||
      !audience ||
      !exactString(audience, this.options.clientId) ||
      (raw['azp'] !== undefined &&
        (!authorizedPresenter || !exactString(authorizedPresenter, this.options.clientId))) ||
      !email ||
      raw['email_verified'] !== true ||
      !nonce ||
      !exactString(nonce, expectedNonce) ||
      iat === undefined ||
      exp === undefined ||
      authTime === undefined
    ) {
      return {
        accepted: false,
        code: raw['email_verified'] === false ? 'EMAIL_UNVERIFIED' : 'INVALID_TOKEN',
      };
    }
    const now = this.clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      return { accepted: false, code: 'OIDC_UNAVAILABLE' };
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (
      exp < nowSeconds - CLOCK_SKEW_SECONDS_V1 ||
      iat > nowSeconds + CLOCK_SKEW_SECONDS_V1 ||
      iat < nowSeconds - 600 - CLOCK_SKEW_SECONDS_V1 ||
      authTime > nowSeconds + CLOCK_SKEW_SECONDS_V1 ||
      authTime < nowSeconds - this.maxAuthenticationAgeSeconds
    )
      return { accepted: false, code: 'INVALID_TOKEN' };
    const claims: GoogleIdTokenClaimsV1 = {
      iss: issuer,
      sub: subject,
      aud: audience,
      ...(authorizedPresenter ? { azp: authorizedPresenter } : {}),
      email,
      email_verified: true,
      nonce,
      iat,
      exp,
      auth_time: authTime,
    };
    return {
      accepted: true,
      value: Object.freeze({
        issuer: this.issuer,
        subject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified,
        authenticatedAt: new Date(claims.auth_time * 1_000).toISOString(),
      }),
    };
  }

  private async keyForId(kid: string): Promise<GoogleJwkV1 | undefined> {
    const now = this.clock().getTime();
    if (this.cachedKeys && this.cachedKeys.expiresAt > now) {
      return this.cachedKeys.keys.find((key) => key.kid === kid);
    }
    const response = await this.providerFetch(GOOGLE_JWKS_URI_V1, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('IAM_OIDC_GOOGLE_JWKS_UNAVAILABLE');
    const body = jsonObject(await response.json());
    const candidates = body?.['keys'];
    if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 50)
      return undefined;
    const keys = candidates
      .map(googleJwk)
      .filter((value): value is GoogleJwkV1 => value !== undefined);
    if (keys.length === 0) return undefined;
    this.cachedKeys = Object.freeze({
      keys: Object.freeze(keys),
      expiresAt: now + maxAgeMilliseconds(response.headers.get('cache-control')),
    });
    return keys.find((key) => key.kid === kid);
  }
}
