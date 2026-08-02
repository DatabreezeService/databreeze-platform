import assert from 'node:assert/strict';
import type { OutgoingHttpHeaders } from 'node:http';
import test from 'node:test';

import { parseV1Contract } from '@databreeze/contracts/v1';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createApiApplication } from '../src/bootstrap.js';
import { createIamTenantContextV1 } from '../src/features/iam/application/tenant-context.js';
import { InMemoryMfaRepositoryAdapter } from '../src/features/iam/adapter/in-memory-mfa-repository.adapter.js';
import { MfaService } from '../src/features/iam/application/mfa.service.js';

interface InjectResponse {
  readonly body: string;
  readonly headers: OutgoingHttpHeaders;
  readonly statusCode: number;
  json(): Record<string, unknown>;
}

function responseHeader(response: InjectResponse, name: string): string {
  const value = response.headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
}

const problemSchemaId = 'https://schemas.databreeze.dev/contracts/v1/problem-details';
const correlationId = '123e4567-e89b-42d3-a456-426614174000';
const secondCorrelationId = '018f1f08-7b2c-7c74-8e12-f639c7c92b15';
const leakedMarker = 'do-not-leak-7f6290';
const csrfToken = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';

async function withApp(
  options: Parameters<typeof createApiApplication>[0],
  run: (app: NestFastifyApplication) => Promise<void>,
): Promise<void> {
  const { app } = await createApiApplication(options);
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

function assertResponseIdentifiers(response: InjectResponse): void {
  assert.match(responseHeader(response, 'x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.match(responseHeader(response, 'x-correlation-id'), /^[0-9a-f-]{36}$/i);
}

function assertProblem(response: InjectResponse, status: number, code: string): void {
  assert.equal(response.statusCode, status);
  assert.match(responseHeader(response, 'content-type'), /^application\/problem\+json/);
  assertResponseIdentifiers(response);
  const body: unknown = response.json();
  assert.deepEqual(parseV1Contract(problemSchemaId, body), { accepted: true, value: body });
  assert.equal((body as { code: unknown }).code, code);
  assert.equal(
    (body as { correlationId: unknown }).correlationId,
    responseHeader(response, 'x-correlation-id'),
  );
}

function parsedBody<TValue>(response: { readonly body: string }): TValue {
  const parsed: unknown = JSON.parse(response.body);
  return parsed as TValue;
}

void test('reports ready only through the injectable readiness port and minimizes failed-check details', async () => {
  await withApp({ readinessPort: { check: () => Promise.resolve(true) } }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ready' });
    assertResponseIdentifiers(response);
  });

  await withApp(
    { readinessPort: { check: () => Promise.reject(new Error(`postgres ${leakedMarker}`)) } },
    async (app) => {
      const response = await app.inject({ method: 'GET', url: '/health/ready' });
      assertProblem(response, 503, 'NOT_READY');
      assert.doesNotMatch(response.body, new RegExp(leakedMarker));
      assert.doesNotMatch(response.body, /postgres/i);
    },
  );
});

void test('propagates one valid correlation UUID while generating a distinct request UUID', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': correlationId },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-correlation-id'], correlationId);
    assert.notEqual(response.headers['x-request-id'], correlationId);
  });
});

void test('rejects malformed and multiple correlation values without reflecting them', async () => {
  await withApp({}, async (app) => {
    const malformed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': leakedMarker },
    });
    assertProblem(malformed, 400, 'CORRELATION_ID_INVALID');
    assert.doesNotMatch(malformed.body, new RegExp(leakedMarker));

    const multiple = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': [correlationId, secondCorrelationId] },
    });
    assertProblem(multiple, 400, 'CORRELATION_ID_INVALID');
    assert.doesNotMatch(multiple.body, new RegExp(correlationId));
    assert.doesNotMatch(multiple.body, new RegExp(secondCorrelationId));
  });
});

void test('maps unknown routes to safe Problem Details without exposing the path or query', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/missing-${leakedMarker}?token=${leakedMarker}`,
    });
    assertProblem(response, 404, 'ROUTE_NOT_FOUND');
    assert.doesNotMatch(response.body, new RegExp(leakedMarker));
  });
});

void test('validates declared compatibility query fields and rejects unknown query fields safely', async () => {
  await withApp({}, async (app) => {
    const valid = await app.inject({
      method: 'GET',
      url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3',
    });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.json(), { apiMajorVersion: 1, status: 'supported' });
    assertResponseIdentifiers(valid);

    const suffixGarbage = await app.inject({
      method: 'GET',
      url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3garbage',
    });
    assertProblem(suffixGarbage, 400, 'VALIDATION_FAILED');

    const unknown = await app.inject({
      method: 'GET',
      url: `/v1/system/compatibility?clientPlatform=web&${leakedMarker}=secret`,
    });
    assertProblem(unknown, 400, 'VALIDATION_FAILED');
    const unknownBody: unknown = unknown.json();
    assert.deepEqual((unknownBody as Record<string, unknown>)['fieldErrors'], [
      { field: 'request', code: 'UNKNOWN_FIELD' },
    ]);
    assert.doesNotMatch(unknown.body, new RegExp(leakedMarker));
  });
});

void test('validates closed compatibility bodies without implicit scalar coercion', async () => {
  await withApp({}, async (app) => {
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'desktop', clientVersion: '2.4.0' },
    });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.json(), { apiMajorVersion: 1, status: 'supported' });

    const invalidType = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'desktop', clientVersion: 24 },
    });
    assertProblem(invalidType, 400, 'VALIDATION_FAILED');
    const invalidTypeBody: unknown = invalidType.json();
    assert.deepEqual((invalidTypeBody as Record<string, unknown>)['fieldErrors'], [
      { field: 'clientVersion', code: 'INVALID_TYPE' },
    ]);

    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'web', clientVersion: '1.0.0', [leakedMarker]: 'secret' },
    });
    assertProblem(unknown, 400, 'VALIDATION_FAILED');
    assert.doesNotMatch(unknown.body, new RegExp(leakedMarker));
  });
});

void test('enforces CSRF only for browser-cookie mutations and keeps token values out of errors', async () => {
  await withApp({}, async (app) => {
    const missing = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      headers: {
        cookie: 'databreeze_refresh=session-value',
        origin: 'http://localhost:3000',
      },
      payload: { clientPlatform: 'web', clientVersion: '1.0.0' },
    });
    assertProblem(missing, 403, 'CSRF_REQUIRED');
    assert.doesNotMatch(missing.body, new RegExp(csrfToken));

    const hostile = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      headers: {
        cookie: `databreeze_refresh=session-value; databreeze_csrf=${csrfToken}`,
        'x-csrf-token': csrfToken,
        origin: 'https://evil.example',
      },
      payload: { clientPlatform: 'web', clientVersion: '1.0.0' },
    });
    assertProblem(hostile, 403, 'ORIGIN_INVALID');
    assert.doesNotMatch(hostile.body, new RegExp(csrfToken));

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      headers: {
        cookie: `databreeze_refresh=session-value; databreeze_csrf=${csrfToken}`,
        'x-csrf-token': csrfToken,
        origin: 'http://localhost:3000',
      },
      payload: { clientPlatform: 'web', clientVersion: '1.0.0' },
    });
    assert.equal(accepted.statusCode, 200);

    const safeRead = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { cookie: 'databreeze_refresh=session-value' },
    });
    assert.equal(safeRead.statusCode, 200);
  });
});

void test('maps an oversized JSON body to safe Problem Details', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'web', clientVersion: 'a'.repeat(70_000) },
    });
    assertProblem(response, 413, 'PAYLOAD_TOO_LARGE');
    assert.doesNotMatch(response.body, /a{100}/);
  });
});

void test('scrubs unexpected application errors into stable Problem Details', async () => {
  await withApp(
    {
      compatibilityPort: {
        check: () => Promise.reject(new Error(`select * from secret ${leakedMarker}`)),
      },
    },
    async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3',
      });
      assertProblem(response, 500, 'INTERNAL_ERROR');
      assert.doesNotMatch(response.body, new RegExp(leakedMarker));
      assert.doesNotMatch(response.body, /select|secret/i);
    },
  );
});

void test('sign-in returns a session DTO and maps authentication failures without provider details', async () => {
  await withApp(
    {
      authentication: {
        signIn: () =>
          Promise.resolve({
            accepted: true as const,
            value: {
              principal: {
                userId: '00000000-0000-4000-8000-000000000001',
                organizationId: '00000000-0000-4000-8000-000000000002',
                workspaceId: '00000000-0000-4000-8000-000000000003',
                securityEpoch: 2,
                mfaRequired: true,
              },
              session: {
                sessionId: '00000000-0000-4000-8000-000000000010',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                accessExpiresAt: '2026-01-01T00:15:00.000Z',
              },
            },
          }),
      },
    },
    async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in',
        payload: {
          email: 'user@example.com',
          password: 'correct horse battery staple',
          clientPlatform: 'web',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        sessionId: '00000000-0000-4000-8000-000000000010',
        userId: '00000000-0000-4000-8000-000000000001',
        organizationId: '00000000-0000-4000-8000-000000000002',
        workspaceId: '00000000-0000-4000-8000-000000000003',
        accessToken: 'access-token',
        accessExpiresAt: '2026-01-01T00:15:00.000Z',
        securityEpoch: 2,
        mfaRequired: true,
      });
      const setCookies = response.headers['set-cookie'];
      assert.ok(Array.isArray(setCookies));
      assert.equal(setCookies.length, 2);
      assert.match(setCookies[0] ?? '', /^databreeze_refresh=refresh-token; .*HttpOnly; Secure; SameSite=Lax$/);
      assert.match(setCookies[1] ?? '', /^databreeze_csrf=[A-Za-z0-9_-]+; .*Secure; SameSite=Lax$/);
      assertResponseIdentifiers(response);
    },
  );

  await withApp(
    {
      authentication: {
        signIn: () =>
          Promise.resolve({ accepted: false as const, code: 'INVALID_CREDENTIALS' as const }),
      },
    },
    async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in',
        payload: {
          email: 'user@example.com',
          password: 'correct horse battery staple',
          clientPlatform: 'web',
        },
      });
      assertProblem(response, 401, 'AUTHENTICATION_FAILED');
      assert.doesNotMatch(response.body, /INVALID_CREDENTIALS/);
    },
  );

  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: {
        email: 'user@example.com',
        password: 'correct horse battery staple',
        clientPlatform: 'web',
      },
    });
    assertProblem(response, 503, 'AUTHENTICATION_UNAVAILABLE');
  });
});

void test('refresh rotates Web cookies without returning the refresh token and preserves native delivery', async () => {
  const refreshed = {
    sessionId: '00000000-0000-4000-8000-000000000020',
    accessToken: 'next-access-token',
    refreshToken: 'next-refresh-token',
    accessExpiresAt: '2026-01-01T00:15:00.000Z',
  };
  const presented: string[] = [];
  await withApp(
    {
      sessions: {
        issue: () => Promise.reject(new Error('not used')),
        refresh: (token, platform) => {
          if (platform === 'web') presented.push(String(token));
          return Promise.resolve({ accepted: true as const, value: refreshed });
        },
        revoke: () => Promise.resolve(true),
        findPrincipal: () => Promise.resolve(undefined),
      },
    },
    async (app) => {
      const web = await app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        headers: {
          cookie: `databreeze_refresh=current-refresh-token; databreeze_csrf=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
        },
        payload: { clientPlatform: 'web' },
      });
      assert.equal(web.statusCode, 200);
      assert.deepEqual(web.json(), {
        sessionId: refreshed.sessionId,
        accessToken: refreshed.accessToken,
        accessExpiresAt: refreshed.accessExpiresAt,
      });
      const webCookies = web.headers['set-cookie'];
      assert.ok(Array.isArray(webCookies));
      assert.equal(webCookies.length, 2);
      assert.match(webCookies[0] ?? '', /^databreeze_refresh=next-refresh-token; .*HttpOnly; Secure; SameSite=Lax$/);
      assert.match(webCookies[1] ?? '', /^databreeze_csrf=[A-Za-z0-9_-]+; .*Secure; SameSite=Lax$/);

      const native = await app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { clientPlatform: 'desktop', refreshToken: 'desktop-refresh-token' },
      });
      assert.equal(native.statusCode, 200);
      const nativeBody = parsedBody<{ readonly refreshToken?: unknown }>(native);
      assert.equal(nativeBody['refreshToken'], refreshed.refreshToken);
      assert.equal(native.headers['set-cookie'], undefined);
      assert.deepEqual(presented, ['current-refresh-token']);
    },
  );

  await withApp(
    {
      sessions: {
        issue: () => Promise.reject(new Error('not used')),
        refresh: () => Promise.resolve({ accepted: false as const, code: 'REUSE_DETECTED' as const }),
        revoke: () => Promise.resolve(true),
        findPrincipal: () => Promise.resolve(undefined),
      },
    },
    async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { clientPlatform: 'desktop', refreshToken: 'reused-token' },
      });
      assertProblem(response, 401, 'SESSION_INVALID');
      assert.doesNotMatch(response.body, /REUSE_DETECTED/);
    },
  );
});

void test('sign-out revokes idempotently and clears browser credentials', async () => {
  const revoked: string[] = [];
  await withApp(
    {
      sessions: {
        issue: () => Promise.reject(new Error('not used')),
        refresh: () => Promise.reject(new Error('not used')),
        revoke: (sessionId) => {
          revoked.push(String(sessionId));
          return Promise.resolve(false);
        },
        findPrincipal: () => Promise.resolve(undefined),
      },
    },
    async (app) => {
      const web = await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-out',
        headers: {
          cookie: `databreeze_refresh=current-refresh-token; databreeze_csrf=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
        },
        payload: {
          clientPlatform: 'web',
          sessionId: '00000000-0000-4000-8000-000000000010',
        },
      });
      assert.equal(web.statusCode, 204);
      assert.equal(web.body, '');
      const webCookies = web.headers['set-cookie'];
      assert.ok(Array.isArray(webCookies));
      assert.match(webCookies[0] ?? '', /^databreeze_refresh=; Max-Age=0; .*HttpOnly; Secure; SameSite=Lax$/);
      assert.match(webCookies[1] ?? '', /^databreeze_csrf=; Max-Age=0; .*Secure; SameSite=Lax$/);

      const native = await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-out',
        payload: {
          clientPlatform: 'android',
          sessionId: '00000000-0000-4000-8000-000000000011',
        },
      });
      assert.equal(native.statusCode, 204);
      assert.equal(native.headers['set-cookie'], undefined);
      assert.deepEqual(revoked, [
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000011',
      ]);
    },
  );
});

void test('protected artifact reads derive tenant scope from an authenticated access token', async () => {
  const principal = {
    userId: '00000000-0000-4000-8000-000000000001',
    organizationId: '00000000-0000-4000-8000-000000000002',
    workspaceId: '00000000-0000-4000-8000-000000000003',
    securityEpoch: 3,
    mfaRequired: false,
  };
  await withApp(
    {
      sessions: {
        issue: () => Promise.reject(new Error('not used')),
        refresh: () => Promise.reject(new Error('not used')),
        revoke: () => Promise.resolve(true),
        findPrincipal: () => Promise.resolve(principal),
        findPrincipalByAccessToken: (token) =>
          Promise.resolve(token === 'access-token-for-context-1' ? principal : undefined),
      },
    },
    async (app) => {
      const unauthenticated = await app.inject({ method: 'GET', url: '/v1/artifacts/inbox' });
      assertProblem(unauthenticated, 401, 'AUTHENTICATION_FAILED');

      const authenticated = await app.inject({
        method: 'GET',
        url: '/v1/artifacts/inbox',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(authenticated.statusCode, 200);
      assert.deepEqual(authenticated.json(), []);

      const currentSession = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(currentSession.statusCode, 200);
      assert.deepEqual(currentSession.json(), {
        userId: principal.userId,
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        authorizationEpoch: principal.securityEpoch,
        mfaRequired: principal.mfaRequired,
      });

      const auditEvents = await app.inject({
        method: 'GET',
        url: '/v1/audit/events',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(auditEvents.statusCode, 200);
      assert.deepEqual(auditEvents.json(), []);

      const auditSeals = await app.inject({
        method: 'GET',
        url: '/v1/audit/seals',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(auditSeals.statusCode, 200);
      assert.deepEqual(auditSeals.json(), []);

      const usage = await app.inject({
        method: 'GET',
        url: '/v1/entitlements/usage',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(usage.statusCode, 200);
      assert.deepEqual(usage.json(), { entries: [], reservations: [] });

      const missingSnapshot = await app.inject({
        method: 'GET',
        url: '/v1/entitlements/snapshots/80000000-0000-4000-8000-000000000099',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(missingSnapshot.statusCode, 200);
      assert.deepEqual(missingSnapshot.json(), {
        accepted: false,
        code: 'ENTITLEMENT_NOT_FOUND',
      });

      const invalidSnapshot = await app.inject({
        method: 'GET',
        url: '/v1/entitlements/snapshots/not-an-id',
        headers: { authorization: 'Bearer access-token-for-context-1' },
      });
      assert.equal(invalidSnapshot.statusCode, 200);
      assert.deepEqual(invalidSnapshot.json(), {
        accepted: false,
        code: 'INVALID_IDENTIFIER',
      });
    },
  );
});

void test('MFA HTTP lifecycle derives the user from the authenticated tenant context and returns redacted state', async () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  const mfaService = new MfaService(new InMemoryMfaRepositoryAdapter(), {
    matches: (presented, stored) => presented === stored,
  });
  const contextResult = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: '00000000-0000-4000-8000-000000000002',
      workspaceId: '00000000-0000-4000-8000-000000000003',
    },
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000004',
    idempotencyKey: 'mfa-http-test',
    authorizationEpoch: 1,
  });
  assert.equal(contextResult.accepted, true);
  if (!contextResult.accepted) return;
  const requestTenantContext = { resolve: () => Promise.resolve(contextResult.value) };
  await withApp({ mfaService, requestTenantContext }, async (app) => {
    const enrolled = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/factors',
      payload: {
        id: '00000000-0000-4000-8000-000000000010',
        method: 'TOTP',
        secretReference: 'vault://iam/mfa/test-factor',
        enrolledAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(enrolled.statusCode, 200);
    const enrolledBody = parsedBody<{
      readonly factors: readonly [{ readonly status: string; readonly secretReference?: unknown }];
    }>(enrolled);
    assert.equal(enrolledBody.factors[0].status, 'PENDING');
    assert.equal(enrolledBody.factors[0].secretReference, undefined);

    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/factors/00000000-0000-4000-8000-000000000010/verify',
      payload: { at: '2026-01-01T00:01:00.000Z' },
    });
    assert.equal(verified.statusCode, 200);
    const verifiedBody = parsedBody<{ readonly factors: readonly [{ readonly status: string }] }>(verified);
    assert.equal(verifiedBody.factors[0].status, 'ACTIVE');

    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/factors/00000000-0000-4000-8000-000000000099/verify',
      payload: { at: '2026-01-01T00:02:00.000Z' },
    });
    assertProblem(invalid, 400, 'MFA_REQUEST_REJECTED');
  });
});
