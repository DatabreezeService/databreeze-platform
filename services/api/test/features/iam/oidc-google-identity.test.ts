import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { OidcGoogleIdentityAdapter } from '../../../src/features/iam/adapter/oidc-google-identity.adapter.js';

const NOW = new Date('2026-08-13T03:00:00.000Z');
const REDIRECT_URI = 'https://api.databreeze.example/v1/auth/oidc/google/callback';
const CLIENT_ID = 'google-client.apps.googleusercontent.com';

function base64urlJson(value: Readonly<Record<string, unknown>>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signedIdToken(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  claims: Readonly<Record<string, unknown>>,
): string {
  const header = base64urlJson({ alg: 'RS256', kid: 'google-key-1', typ: 'JWT' });
  const payload = base64urlJson(claims);
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`, 'ascii'), privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function validClaims(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const nowSeconds = Math.floor(NOW.getTime() / 1_000);
  return {
    iss: 'https://accounts.google.com',
    sub: 'google-subject-1',
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    email: 'owner@example.com',
    email_verified: true,
    nonce: 'n'.repeat(32),
    iat: nowSeconds - 10,
    exp: nowSeconds + 300,
    auth_time: nowSeconds - 60,
    ...overrides,
  };
}

void test('[IAM-003][IAM-023] exchanges the server authorization code and verifies the Google ID token locally', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  const adapter = new OidcGoogleIdentityAdapter({
    clientId: CLIENT_ID,
    clientSecret: 'server-only-client-secret',
    approvedRedirectUris: [REDIRECT_URI],
    clock: () => NOW,
    fetch: (url, init) => {
      requests.push({ url: String(url), ...(init === undefined ? {} : { init }) });
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'provider-token-must-not-escape',
              id_token: signedIdToken(privateKey, validClaims()),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: 'google-key-1', alg: 'RS256', use: 'sig' }] }),
            { status: 200, headers: { 'cache-control': 'public, max-age=3600' } },
          ),
        );
      }
      return Promise.resolve(new Response('', { status: 404 }));
    },
  });

  const result = await adapter.verifyAuthorizationCode({
    code: 'one-time-google-code',
    codeVerifier: 'v'.repeat(64),
    redirectUri: REDIRECT_URI,
    nonce: 'n'.repeat(32),
  });

  assert.deepEqual(result, {
    accepted: true,
    value: {
      issuer: 'https://accounts.google.com',
      subject: 'google-subject-1',
      email: 'owner@example.com',
      emailVerified: true,
      authenticatedAt: '2026-08-13T02:59:00.000Z',
    },
  });
  assert.equal(requests.length, 2);
  const tokenBody = requests[0]?.init?.body;
  assert.ok(tokenBody instanceof URLSearchParams);
  assert.equal(tokenBody.get('code'), 'one-time-google-code');
  assert.equal(tokenBody.get('code_verifier'), 'v'.repeat(64));
  assert.equal(tokenBody.get('client_secret'), 'server-only-client-secret');
  assert.equal(JSON.stringify(result).includes('provider-token-must-not-escape'), false);
});

void test('[IAM-003][IAM-023] rejects unapproved redirects before provider egress', async () => {
  let called = false;
  const adapter = new OidcGoogleIdentityAdapter({
    clientId: CLIENT_ID,
    clientSecret: 'server-only-client-secret',
    approvedRedirectUris: [REDIRECT_URI],
    fetch: () => {
      called = true;
      return Promise.resolve(new Response('', { status: 500 }));
    },
  });

  const result = await adapter.verifyAuthorizationCode({
    code: 'one-time-google-code',
    codeVerifier: 'v'.repeat(64),
    redirectUri: 'https://attacker.example/callback',
    nonce: 'n'.repeat(32),
  });

  assert.deepEqual(result, { accepted: false, code: 'INVALID_INPUT' });
  assert.equal(called, false);
});

void test('[IAM-003][IAM-023] rejects a signed token with the wrong nonce, audience, or authentication age', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const nowSeconds = Math.floor(NOW.getTime() / 1_000);
  const rejectedClaims = [
    validClaims({ nonce: 'wrong-nonce-value' }),
    validClaims({ aud: 'other-client.apps.googleusercontent.com' }),
    validClaims({ auth_time: nowSeconds - 3_601 }),
    validClaims({ email_verified: false }),
  ];

  for (const claims of rejectedClaims) {
    const adapter = new OidcGoogleIdentityAdapter({
      clientId: CLIENT_ID,
      clientSecret: 'server-only-client-secret',
      approvedRedirectUris: [REDIRECT_URI],
      clock: () => NOW,
      maxAuthenticationAgeSeconds: 3_600,
      fetch: (url) =>
        String(url).endsWith('/token')
          ? Promise.resolve(
              new Response(JSON.stringify({ id_token: signedIdToken(privateKey, claims) }), {
                status: 200,
              }),
            )
          : Promise.resolve(
              new Response(
                JSON.stringify({
                  keys: [{ ...jwk, kid: 'google-key-1', alg: 'RS256', use: 'sig' }],
                }),
                { status: 200 },
              ),
            ),
    });
    const result = await adapter.verifyAuthorizationCode({
      code: 'one-time-google-code',
      codeVerifier: 'v'.repeat(64),
      redirectUri: REDIRECT_URI,
      nonce: 'n'.repeat(32),
    });
    assert.equal(result.accepted, false);
  }
});
