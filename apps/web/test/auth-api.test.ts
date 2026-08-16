import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthApiV1 } from '../src/features/auth/auth-api.ts';
import {
  clearAuthSessionV1,
  currentAccessTokenV1,
  rememberAuthSessionV1,
} from '../src/features/auth/auth-session.ts';

afterEach(() => {
  clearAuthSessionV1();
  vi.unstubAllGlobals();
});

function jsonBody(init?: RequestInit): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

describe('generated-contract auth transport [IAM-022, IAM-023, WEB-004]', () => {
  const session = {
    schemaVersion: 4 as const,
    sessionId: '00000000-0000-4000-8000-000000000401',
    userId: '00000000-0000-4000-8000-000000000402',
    organizationId: '00000000-0000-4000-8000-000000000403',
    workspaceId: '00000000-0000-4000-8000-000000000404',
    accessToken: 's'.repeat(80),
    accessExpiresAt: '2026-08-13T00:15:00.000Z',
    securityEpoch: 1,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  };

  it('registers with email/password and returns only the opaque OTP challenge', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.credentials).toBe('include');
      expect(jsonBody(init)).toEqual({
        schemaVersion: 4,
        email: 'owner@example.com',
        password: 'correct horse battery staple',
        locale: 'vi-VN',
      });
      return new Response(
        JSON.stringify({
          schemaVersion: 4,
          accepted: true,
          value: {
            requested: true,
            challengeId: '00000000-0000-4000-8000-000000000301',
          },
        }),
        { status: 202, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = createAuthApiV1({ baseUrl: 'https://api.example.test' } as never);

    await expect(
      (api as never as { register(input: unknown): Promise<unknown> }).register({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
        locale: 'vi-VN',
      }),
    ).resolves.toEqual({
      accepted: true,
      value: { requested: true, challengeId: '00000000-0000-4000-8000-000000000301' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/register',
      expect.any(Object),
    );
  });

  it('verifies six-digit OTP and keeps the browser refresh token out of JavaScript', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schemaVersion: 4,
              sessionId: '00000000-0000-4000-8000-000000000401',
              userId: '00000000-0000-4000-8000-000000000402',
              organizationId: '00000000-0000-4000-8000-000000000403',
              workspaceId: '00000000-0000-4000-8000-000000000404',
              accessToken: `${'a'.repeat(80)}`,
              accessExpiresAt: '2026-08-13T00:15:00.000Z',
              securityEpoch: 1,
              mfaRequired: false,
              mfaReenrollmentRequired: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const api = createAuthApiV1({ baseUrl: 'https://api.example.test' } as never);
    const result = await (
      api as never as { verifyEmailRegistration(input: unknown): Promise<Record<string, unknown>> }
    ).verifyEmailRegistration({
      challengeId: '00000000-0000-4000-8000-000000000301',
      code: '123456',
      idempotencyKey: 'registration-activation-0001',
    });
    expect(result['accepted']).toBe(true);
    expect(JSON.stringify(result)).not.toContain('refreshToken');
  });

  it('rejects a malformed successful payload instead of trusting the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ accepted: true, accessToken: 'provider-secret' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const api = createAuthApiV1({ baseUrl: 'https://api.example.test' } as never);
    await expect(
      api.signInWithPassword({ email: 'owner@example.com', password: 'password' }),
    ).resolves.toEqual({
      accepted: false,
      code: 'AUTH_FAILED',
    });
  });

  it('requests and completes password recovery only for the closed recovery response shapes', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = jsonBody(init);
      if (url.endsWith('/v1/auth/recovery')) {
        expect(body).toEqual({ email: 'owner@example.com', locale: 'en' });
        return new Response(JSON.stringify({ requested: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(url).toMatch(/\/v1\/auth\/recovery\/complete$/u);
      expect(body).toEqual({
        token: 'r'.repeat(43),
        newPassword: 'new correct horse battery staple',
      });
      return new Response(
        JSON.stringify({
          userId: '00000000-0000-4000-8000-000000000402',
          mfaReenrollmentRequired: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: fetchMock as never,
    });

    await expect(
      api.requestPasswordReset({ email: 'owner@example.com', locale: 'en' }),
    ).resolves.toEqual({ accepted: true });
    await expect(
      api.completePasswordReset({
        token: 'r'.repeat(43),
        newPassword: 'new correct horse battery staple',
      }),
    ).resolves.toEqual({
      accepted: true,
      value: {
        userId: '00000000-0000-4000-8000-000000000402',
        mfaReenrollmentRequired: true,
      },
    });
  });

  it('fails closed when a recovery endpoint returns a malformed completion payload', async () => {
    const malformed = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify({ userId: 'user', mfaReenrollmentRequired: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as never,
    });
    await expect(
      malformed.completePasswordReset({ token: 'r'.repeat(43), newPassword: 'password' }),
    ).resolves.toEqual({ accepted: false, code: 'AUTH_FAILED' });
  });

  it('recovers a reload through the HttpOnly-cookie refresh endpoint and remembers only the v4 access session', async () => {
    globalThis.document.cookie = `databreeze_csrf=${'c'.repeat(43)}; Path=/`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.credentials).toBe('include');
      expect(new Headers(init?.headers).get('x-csrf-token')).toBe('c'.repeat(43));
      expect(jsonBody(init)).toEqual({ clientPlatform: 'web' });
      return new Response(
        JSON.stringify({
          schemaVersion: 4,
          sessionId: '00000000-0000-4000-8000-000000000401',
          userId: '00000000-0000-4000-8000-000000000402',
          organizationId: '00000000-0000-4000-8000-000000000403',
          workspaceId: '00000000-0000-4000-8000-000000000404',
          accessToken: 'r'.repeat(80),
          accessExpiresAt: '2026-08-13T00:15:00.000Z',
          securityEpoch: 1,
          mfaRequired: false,
          mfaReenrollmentRequired: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: fetchMock as never,
    });

    await expect(api.recoverWebSession()).resolves.toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/refresh',
      expect.any(Object),
    );
    expect(currentAccessTokenV1()).toBe('r'.repeat(80));
  });

  it('loads the closed v4 bootstrap through the bearer-authenticated API boundary', async () => {
    rememberAuthSessionV1(session);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${session.accessToken}`);
      expect(init?.credentials).toBe('include');
      return new Response(
        JSON.stringify({
          schemaVersion: 4,
          outcome: 'ACCEPTED',
          value: {
            user: {
              id: session.userId,
              displayName: 'Mai Quynh',
              locale: 'vi-VN',
              mfaState: 'NOT_CONFIGURED',
            },
            organizations: [
              {
                id: session.organizationId,
                name: 'DataBreeze',
                personal: true,
                status: 'ACTIVE',
                workspaces: [
                  {
                    id: session.workspaceId,
                    name: 'Không gian chính',
                    status: 'ACTIVE',
                    projects: [
                      {
                        id: '00000000-0000-4000-8000-000000000405',
                        name: 'Dữ liệu đầu tiên',
                        kind: 'INTERNAL',
                        status: 'ACTIVE',
                      },
                    ],
                  },
                ],
              },
            ],
            recentScopes: [
              {
                scopeType: 'workspace',
                organizationId: session.organizationId,
                workspaceId: session.workspaceId,
              },
            ],
            session: {
              scopeType: 'workspace',
              organizationId: session.organizationId,
              workspaceId: session.workspaceId,
              authorizationEpoch: 1,
            },
            platform: { apiVersion: 'v1' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: fetchMock as never,
    });

    await expect(api.loadBootstrap()).resolves.toMatchObject({
      accepted: true,
      value: { user: { displayName: 'Mai Quynh' } },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/me/bootstrap',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails closed on a rejected or authority-bearing bootstrap response', async () => {
    const payloads = [
      { schemaVersion: 4, outcome: 'REJECTED', code: 'UNAVAILABLE' },
      {
        schemaVersion: 4,
        outcome: 'ACCEPTED',
        value: {
          user: {
            id: session.userId,
            displayName: 'Mai',
            locale: 'vi-VN',
            mfaState: 'NOT_CONFIGURED',
            clientRole: 'OWNER',
          },
          organizations: [],
          recentScopes: [],
          session: {
            scopeType: 'workspace',
            organizationId: session.organizationId,
            workspaceId: session.workspaceId,
            authorizationEpoch: 1,
          },
          platform: { apiVersion: 'v1' },
        },
      },
    ];
    for (const payload of payloads) {
      const api = createAuthApiV1({
        baseUrl: 'https://api.example.test',
        fetcher: vi.fn(
          async () =>
            new Response(JSON.stringify(payload), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        ) as never,
      });
      await expect(api.loadBootstrap()).resolves.toEqual({ accepted: false, code: 'AUTH_FAILED' });
    }
  });

  it('fails closed and clears memory on refresh denial, outage, missing CSRF, or a non-v4 response', async () => {
    const cases = [
      {
        cookie: `databreeze_csrf=${'c'.repeat(43)}`,
        fetcher: vi.fn(async () => new Response(null, { status: 401 })),
      },
      {
        cookie: `databreeze_csrf=${'c'.repeat(43)}`,
        fetcher: vi.fn(async () => Promise.reject(new Error('offline'))),
      },
      {
        cookie: '',
        fetcher: vi.fn(async () => new Response(null, { status: 200 })),
      },
      {
        cookie: `databreeze_csrf=${'c'.repeat(43)}`,
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                sessionId: '00000000-0000-4000-8000-000000000401',
                accessToken: 'legacy-partial-response',
                accessExpiresAt: '2026-08-13T00:15:00.000Z',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        ),
      },
    ];

    for (const testCase of cases) {
      globalThis.document.cookie = 'databreeze_csrf=; Max-Age=0; Path=/';
      if (testCase.cookie !== '') globalThis.document.cookie = `${testCase.cookie}; Path=/`;
      const api = createAuthApiV1({
        baseUrl: 'https://api.example.test',
        fetcher: testCase.fetcher as never,
      });
      await expect(api.recoverWebSession()).resolves.toEqual({
        accepted: false,
        code: 'AUTH_FAILED',
      });
      expect(currentAccessTokenV1()).toBeUndefined();
    }
    expect(cases[2]?.fetcher).not.toHaveBeenCalled();
  });

  it('revokes the current Web session with server-owned identity and clears memory only after 204', async () => {
    rememberAuthSessionV1(session);
    globalThis.document.cookie = `databreeze_csrf=${'c'.repeat(43)}; Path=/`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${session.accessToken}`);
      expect(headers.get('x-csrf-token')).toBe('c'.repeat(43));
      expect(headers.get('idempotency-key')).toBe(session.sessionId);
      expect(jsonBody(init)).toEqual({
        clientPlatform: 'web',
        sessionId: session.sessionId,
      });
      return new Response(null, { status: 204 });
    });
    const api = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: fetchMock as never,
    });

    await expect(api.signOut()).resolves.toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/sign-out',
      expect.any(Object),
    );
    expect(currentAccessTokenV1()).toBeUndefined();
  });

  it('keeps the current session available when server revocation fails', async () => {
    rememberAuthSessionV1(session);
    globalThis.document.cookie = `databreeze_csrf=${'c'.repeat(43)}; Path=/`;
    const api = createAuthApiV1({
      baseUrl: 'https://api.example.test',
      fetcher: vi.fn(async () => new Response(null, { status: 503 })) as never,
    });

    await expect(api.signOut()).resolves.toEqual({ accepted: false, code: 'AUTH_FAILED' });
    expect(currentAccessTokenV1()).toBe(session.accessToken);
  });
});
