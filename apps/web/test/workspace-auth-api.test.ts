import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAuthApiV1 } from '../src/features/auth/auth-api.ts';
import {
  clearAuthSessionV1,
  currentAccessTokenV1,
  rememberAuthSessionV1,
} from '../src/features/auth/auth-session.ts';

const currentSession = {
  schemaVersion: 4 as const,
  scopeType: 'TENANT' as const,
  sessionId: '00000000-0000-4000-8000-000000000601',
  userId: '00000000-0000-4000-8000-000000000602',
  organizationId: '00000000-0000-4000-8000-000000000603',
  workspaceId: '00000000-0000-4000-8000-000000000604',
  accessToken: 'a'.repeat(80),
  accessExpiresAt: '2026-08-17T00:15:00.000Z',
  securityEpoch: 1,
  mfaRequired: false,
  mfaReenrollmentRequired: false,
};

const switchedSession = {
  ...currentSession,
  sessionId: '00000000-0000-4000-8000-000000000605',
  workspaceId: '00000000-0000-4000-8000-000000000606',
  accessToken: 'b'.repeat(80),
};

afterEach(() => {
  clearAuthSessionV1();
  vi.unstubAllGlobals();
});

describe('authenticated workspace switching [IAM-028, WEB-002]', () => {
  it('replaces the access session and accepts the server bootstrap for the target workspace', async () => {
    rememberAuthSessionV1(currentSession);
    globalThis.document.cookie = `databreeze_csrf=${'c'.repeat(43)}; Path=/`;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/auth/scope')) {
        if (typeof init?.body !== 'string') throw new Error('expected a JSON request body');
        expect(JSON.parse(init.body)).toEqual({
          schemaVersion: 4,
          workspaceId: switchedSession.workspaceId,
        });
        expect(new Headers(init?.headers).get('idempotency-key')).toBe(currentSession.sessionId);
        return new Response(JSON.stringify(switchedSession), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          schemaVersion: 4,
          outcome: 'ACCEPTED',
          value: {
            user: {
              id: currentSession.userId,
              displayName: 'Mai',
              locale: 'vi-VN',
              mfaState: 'NOT_CONFIGURED',
            },
            organizations: [
              {
                id: currentSession.organizationId,
                name: 'Bright Cloud',
                personal: true,
                status: 'ACTIVE',
                workspaces: [
                  {
                    id: currentSession.workspaceId,
                    name: 'Bright Cloud',
                    status: 'ACTIVE',
                    projects: [
                      {
                        id: '00000000-0000-4000-8000-000000000607',
                        name: 'Private project',
                        kind: 'INTERNAL',
                        status: 'ACTIVE',
                      },
                    ],
                  },
                  {
                    id: switchedSession.workspaceId,
                    name: 'Client projects',
                    status: 'ACTIVE',
                    projects: [
                      {
                        id: '00000000-0000-4000-8000-000000000608',
                        name: 'Private project',
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
                organizationId: currentSession.organizationId,
                workspaceId: switchedSession.workspaceId,
              },
            ],
            session: {
              scopeType: 'workspace',
              organizationId: currentSession.organizationId,
              workspaceId: switchedSession.workspaceId,
              authorizationEpoch: 1,
            },
            platform: { apiVersion: 'v1' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = createAuthApiV1({ baseUrl: 'https://api.example.test', fetcher: fetcher as never });

    await expect(
      api.switchWorkspace({ workspaceId: switchedSession.workspaceId }),
    ).resolves.toEqual({
      accepted: true,
    });
    expect(currentAccessTokenV1()).toBe(switchedSession.accessToken);
  });
});
