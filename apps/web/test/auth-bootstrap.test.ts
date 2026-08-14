import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installSessionAwareFetchV1,
  rememberAuthSessionV1,
  clearAuthSessionV1,
} from '../src/features/auth/auth-session.ts';
import {
  recoverSessionBeforeAppStartV1,
  startWebApplicationV1,
} from '../src/features/auth/auth-bootstrap.ts';

afterEach(() => {
  clearAuthSessionV1();
  vi.restoreAllMocks();
});

describe('Web authentication bootstrap [IAM-023, WEB-002, WEB-004]', () => {
  const session = {
    schemaVersion: 4 as const,
    sessionId: '00000000-0000-4000-8000-000000000401',
    userId: '00000000-0000-4000-8000-000000000402',
    organizationId: '00000000-0000-4000-8000-000000000403',
    workspaceId: '00000000-0000-4000-8000-000000000404',
    accessToken: 'a'.repeat(80),
    accessExpiresAt: '2026-08-13T00:15:00.000Z',
    securityEpoch: 1,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  };
  const bootstrap = {
    user: { id: session.userId, displayName: 'Mai Quynh', locale: 'vi-VN' as const, mfaState: 'NOT_CONFIGURED' as const },
    organizations: [{
      id: session.organizationId,
      name: 'DataBreeze',
      personal: true,
      status: 'ACTIVE' as const,
      workspaces: [{ id: session.workspaceId, name: 'Không gian chính', status: 'ACTIVE' as const, projects: [] }],
    }],
    recentScopes: [{ scopeType: 'workspace' as const, organizationId: session.organizationId, workspaceId: session.workspaceId }],
    session: { scopeType: 'workspace' as const, organizationId: session.organizationId, workspaceId: session.workspaceId, authorizationEpoch: 1 },
    platform: { apiVersion: 'v1' as const },
  };

  it('installs the memory-only credential transport for shared API clients', async () => {
    rememberAuthSessionV1({
      schemaVersion: 4,
      sessionId: '00000000-0000-4000-8000-000000000401',
      userId: '00000000-0000-4000-8000-000000000402',
      organizationId: '00000000-0000-4000-8000-000000000403',
      workspaceId: '00000000-0000-4000-8000-000000000404',
      accessToken: 'a'.repeat(80),
      accessExpiresAt: '2026-08-13T00:15:00.000Z',
      securityEpoch: 1,
      mfaRequired: false,
      mfaReenrollmentRequired: false,
    });
    let headers = new Headers();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    });

    const restore = installSessionAwareFetchV1({
      apiBaseUrl: 'https://api.example.test',
      applicationOrigin: 'https://app.example.test',
      fetcher,
    });
    try {
      await globalThis.fetch('https://api.example.test/v1/datasets');
    } finally {
      restore();
    }

    expect(headers.get('authorization')).toBe(`Bearer ${'a'.repeat(80)}`);
    expect(globalThis.fetch).not.toBe(fetcher);
  });

  it('recovers before rendering and leaves a protected route unchanged when refresh succeeds', async () => {
    const replace = vi.fn();
    await expect(
      recoverSessionBeforeAppStartV1({
        api: {
          recoverWebSession: vi.fn(async () => { rememberAuthSessionV1(session); return { accepted: true as const }; }),
          loadBootstrap: vi.fn(async () => ({ accepted: true as const, value: bootstrap })),
        },
        pathname: '/vi-VN/dashboards',
        replace,
      }),
    ).resolves.toBe('signed-in');
    expect(replace).not.toHaveBeenCalled();
  });

  it('fails closed to localized sign-in before a protected route can render', async () => {
    const replace = vi.fn();
    await expect(
      recoverSessionBeforeAppStartV1({
        api: {
          recoverWebSession: vi.fn(async () => ({ accepted: false as const, code: 'AUTH_FAILED' as const })),
          loadBootstrap: vi.fn(),
        },
        pathname: '/en/data',
        replace,
      }),
    ).resolves.toBe('signed-out');
    expect(replace).toHaveBeenCalledWith('/en/sign-in');
  });

  it('does not redirect a signed-out user away from public registration routes', async () => {
    const replace = vi.fn();
    await recoverSessionBeforeAppStartV1({
      api: { recoverWebSession: vi.fn(async () => Promise.reject(new Error('offline'))), loadBootstrap: vi.fn() },
      pathname: '/vi-VN/register',
      replace,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not mount application routes until session recovery settles', async () => {
    let settle: ((value: { readonly accepted: true }) => void) | undefined;
    const recovery = new Promise<{ readonly accepted: true }>((resolve) => {
      settle = resolve;
    });
    const mount = vi.fn();
    const starting = startWebApplicationV1({
      api: {
        recoverWebSession: vi.fn(async () => { const result = await recovery; rememberAuthSessionV1(session); return result; }),
        loadBootstrap: vi.fn(async () => ({ accepted: true as const, value: bootstrap })),
      },
      mount,
      pathname: '/vi-VN/dashboards',
      replace: vi.fn(),
    });

    expect(mount).not.toHaveBeenCalled();
    settle?.({ accepted: true });
    await starting;
    expect(mount).toHaveBeenCalledOnce();
  });

  it('fails closed before mount when authenticated bootstrap is unavailable or mismatched', async () => {
    for (const result of [
      { accepted: false as const, code: 'AUTH_FAILED' as const },
      { accepted: true as const, value: { ...bootstrap, user: { ...bootstrap.user, id: '00000000-0000-4000-8000-000000000999' } } },
    ]) {
      const replace = vi.fn();
      await expect(recoverSessionBeforeAppStartV1({
        api: {
          recoverWebSession: vi.fn(async () => { rememberAuthSessionV1(session); return { accepted: true as const }; }),
          loadBootstrap: vi.fn(async () => result),
        },
        pathname: '/en/data',
        replace,
      })).resolves.toBe('signed-out');
      expect(replace).toHaveBeenCalledWith('/en/sign-in');
    }
  });
});
