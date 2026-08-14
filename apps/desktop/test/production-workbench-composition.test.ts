import { describe, expect, it, vi } from 'vitest';

import {
  createApiWorkbenchPort,
  type ProtectedDesktopSession,
  type ProtectedDesktopSessionStore,
} from '../src/main/adapters/api-workbench.adapter.ts';
import { createFailClosedWorkbenchPort } from '../src/main/adapters/fail-closed-workbench.adapter.ts';
import { readDesktopApiConfiguration } from '../src/main/desktop-api-configuration.ts';

function memorySessionStore(): ProtectedDesktopSessionStore & {
  current: ProtectedDesktopSession | null;
} {
  return {
    current: null,
    load() {
      return Promise.resolve(this.current);
    },
    save(value) {
      this.current = value;
      return Promise.resolve();
    },
    clear() {
      this.current = null;
      return Promise.resolve();
    },
  };
}

describe('Desktop production workbench composition (IAM-005, DDA-026, DSK-008)', () => {
  it('fails closed when the API origin is absent, credentialed, or insecure', () => {
    expect(readDesktopApiConfiguration({})).toBeNull();
    expect(
      readDesktopApiConfiguration({ DATABREEZE_API_BASE_URL: 'http://api.example.test' }),
    ).toBeNull();
    expect(
      readDesktopApiConfiguration({
        DATABREEZE_API_BASE_URL: 'https://user:secret@api.example.test',
      }),
    ).toBeNull();
    expect(
      readDesktopApiConfiguration({ DATABREEZE_API_BASE_URL: 'https://api.example.test/v1' }),
    ).toBeNull();
  });

  it('allows an exact HTTPS API origin and explicit development loopback only', () => {
    expect(
      readDesktopApiConfiguration({ DATABREEZE_API_BASE_URL: 'https://api.example.test/' }),
    ).toEqual({ baseUrl: 'https://api.example.test' });
    expect(
      readDesktopApiConfiguration({
        DATABREEZE_API_BASE_URL: 'http://127.0.0.1:3000',
        DATABREEZE_DESKTOP_ALLOW_INSECURE_LOOPBACK: 'true',
      }),
    ).toEqual({ baseUrl: 'http://127.0.0.1:3000' });
  });

  it('signs in through the native-client API and keeps tokens out of public session results', async () => {
    const sessions = memorySessionStore();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: 'b8f3bd00-6ed4-4f60-92fd-1e46402ae480',
          userId: '73e9a358-2fe4-4d0b-bef1-b57c1fbded65',
          organizationId: '60ddf1b8-823a-44cb-aacf-694c6602ca7e',
          workspaceId: '303ec706-72bf-416b-bc27-a66d0119fa87',
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          accessExpiresAt: '2030-01-01T00:00:00.000Z',
          securityEpoch: 3,
          mfaRequired: false,
          mfaReenrollmentRequired: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const port = createApiWorkbenchPort({
      baseUrl: 'https://api.example.test',
      fetchImpl,
      sessionStore: sessions,
      nowMs: () => Date.parse('2029-01-01T00:00:00.000Z'),
    });

    const result = await port.signInWithPassword({
      email: 'owner@example.test',
      password: 'correct horse battery staple',
    });

    expect(result).toEqual({
      signedIn: true,
      accountLabel: 'owner@example.test',
      workspaceLabel: null,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(sessions.current?.accessToken).toBe('access-secret');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/sign-in',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'owner@example.test',
          password: 'correct horse battery staple',
          clientPlatform: 'desktop',
        }),
      }),
    );
  });

  it('clears stale protected material when authentication is rejected', async () => {
    const sessions = memorySessionStore();
    sessions.current = {
      sessionId: 'old',
      userId: 'old',
      organizationId: 'old',
      workspaceId: 'old',
      accessToken: 'old',
      refreshToken: 'old',
      accessExpiresAt: '2030-01-01T00:00:00.000Z',
      accountLabel: null,
      workspaceLabel: null,
    };
    const port = createApiWorkbenchPort({
      baseUrl: 'https://api.example.test',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 })),
      sessionStore: sessions,
    });

    await expect(
      port.signInWithPassword({ email: 'owner@example.test', password: 'wrong-password' }),
    ).resolves.toEqual({ signedIn: false, accountLabel: null, workspaceLabel: null });
    expect(sessions.current).toBeNull();
  });

  it('rotates an expired native access token through the protected refresh token', async () => {
    const sessions = memorySessionStore();
    sessions.current = {
      sessionId: 'session-1',
      userId: 'user-1',
      organizationId: 'organization-1',
      workspaceId: 'workspace-1',
      accessToken: 'expired-access',
      refreshToken: 'refresh-secret',
      accessExpiresAt: '2029-01-01T00:00:00.000Z',
      accountLabel: 'owner@example.test',
      workspaceLabel: null,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: 'session-1',
          accessToken: 'rotated-access',
          refreshToken: 'rotated-refresh',
          accessExpiresAt: '2031-01-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const port = createApiWorkbenchPort({
      baseUrl: 'https://api.example.test',
      fetchImpl,
      sessionStore: sessions,
      nowMs: () => Date.parse('2030-01-01T00:00:00.000Z'),
    });

    await expect(port.getAccessToken()).resolves.toBe('rotated-access');
    expect(sessions.current?.refreshToken).toBe('rotated-refresh');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientPlatform: 'desktop', refreshToken: 'refresh-secret' }),
      }),
    );
  });

  it('does not report fake success for unavailable OTP, Google, agent, review, or import paths', async () => {
    const fallback = createFailClosedWorkbenchPort();
    await expect(fallback.verifyOtp({ code: '123456' })).rejects.toThrow(
      'WORKBENCH_OTP_UNAVAILABLE',
    );
    await expect(fallback.startGoogleOidc()).rejects.toThrow('WORKBENCH_GOOGLE_OIDC_UNAVAILABLE');
    await expect(fallback.runAgentTurn({ message: 'Phan tich doanh thu' })).rejects.toThrow(
      'WORKBENCH_AGENT_UNAVAILABLE',
    );
    await expect(
      fallback.decideFolderReview({ reviewId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', decision: 'approve' }),
    ).rejects.toThrow('WORKBENCH_REVIEW_UNAVAILABLE');
    await expect(fallback.importSource({ profile: 'CSV' })).rejects.toThrow(
      'WORKBENCH_IMPORT_UNAVAILABLE',
    );
  });
});
