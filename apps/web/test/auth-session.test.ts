import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAuthSessionV1,
  createSessionAwareFetchV1,
  currentAccessTokenV1,
  rememberAuthSessionV1,
} from '../src/features/auth/auth-session.ts';

afterEach(clearAuthSessionV1);

describe('memory-only Web session [WEB-004]', () => {
  it('retains only the current access credential and clears it explicitly', () => {
    rememberAuthSessionV1({
      schemaVersion: 4,
      scopeType: 'TENANT',
      sessionId: '00000000-0000-4000-8000-000000000401',
      userId: '00000000-0000-4000-8000-000000000402',
      organizationId: '00000000-0000-4000-8000-000000000403',
      workspaceId: '00000000-0000-4000-8000-000000000404',
      accessToken: 'a'.repeat(80),
      refreshToken: 'must-not-be-retained'.repeat(8),
      accessExpiresAt: '2026-08-13T00:15:00.000Z',
      securityEpoch: 1,
      mfaRequired: false,
      mfaReenrollmentRequired: false,
    });
    expect(currentAccessTokenV1()).toBe('a'.repeat(80));
    clearAuthSessionV1();
    expect(currentAccessTokenV1()).toBeUndefined();
  });

  it('adds the memory-only bearer and CSRF credentials only to the configured API boundary', async () => {
    globalThis.document.cookie = `databreeze_csrf=${'c'.repeat(43)}; Path=/`;
    rememberAuthSessionV1({
      schemaVersion: 4,
      scopeType: 'TENANT',
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
    const calls: { readonly url: string; readonly init: RequestInit | undefined }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input instanceof Request ? input.url : String(input), init });
      return new Response(null, { status: 204 });
    });
    const sessionFetch = createSessionAwareFetchV1({
      apiBaseUrl: 'https://api.example.test',
      applicationOrigin: 'https://app.example.test',
      fetcher,
    });

    await sessionFetch('https://api.example.test/v1/dda/dashboards', { method: 'POST' });
    await sessionFetch('https://unapproved.example.test/collect', {
      headers: { Authorization: `Bearer ${'a'.repeat(80)}` },
      method: 'POST',
    });

    const approvedHeaders = new Headers(calls[0]?.init?.headers);
    expect(approvedHeaders.get('authorization')).toBe(`Bearer ${'a'.repeat(80)}`);
    expect(approvedHeaders.get('x-csrf-token')).toBe('c'.repeat(43));
    const unapprovedHeaders = new Headers(calls[1]?.init?.headers);
    expect(unapprovedHeaders.has('authorization')).toBe(false);
    expect(unapprovedHeaders.has('x-csrf-token')).toBe(false);
  });

  it('does not authorize a same-origin path outside an explicitly configured API prefix', async () => {
    rememberAuthSessionV1({
      schemaVersion: 4,
      scopeType: 'TENANT',
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
    const sessionFetch = createSessionAwareFetchV1({
      apiBaseUrl: '/api',
      applicationOrigin: 'https://app.example.test',
      fetcher: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers = new Headers(init?.headers);
        return new Response(null, { status: 204 });
      }),
    });

    await sessionFetch('https://app.example.test/telemetry');

    expect(headers.has('authorization')).toBe(false);
  });
});
