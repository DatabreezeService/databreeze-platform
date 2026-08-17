import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceApi } from '../src/features/workspace/workspace-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace creation transport [IAM-027, WEB-028]', () => {
  it('sends only the closed name command and validates the accepted response', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion: 4,
        name: 'Client projects',
      });
      expect(new Headers(init?.headers).get('idempotency-key')).toBeTruthy();
      return new Response(
        JSON.stringify({
          schemaVersion: 4,
          workspace: {
            id: '00000000-0000-4000-8000-000000000501',
            organizationId: '00000000-0000-4000-8000-000000000502',
            name: 'Client projects',
            status: 'ACTIVE',
            dataMode: 'HYBRID',
            createdAt: '2026-08-17T00:00:00.000Z',
          },
          defaultProject: {
            id: '00000000-0000-4000-8000-000000000503',
            kind: 'INTERNAL',
            name: 'Private project',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = createWorkspaceApi({
      baseUrl: 'https://api.example.test',
      fetcher: fetcher as never,
    });

    await expect(
      api.createWorkspace('00000000-0000-4000-8000-000000000502', 'Client projects'),
    ).resolves.toMatchObject({ workspace: { name: 'Client projects', dataMode: 'HYBRID' } });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/v1/organizations/00000000-0000-4000-8000-000000000502/workspaces',
      expect.any(Object),
    );
  });
});
