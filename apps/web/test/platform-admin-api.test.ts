import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPlatformAdminApi,
  PlatformAdminApiError,
} from '../src/features/platform-admin/platform-admin-api.ts';

const validOverview = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../packages/test-fixtures/contracts/v4/payloads/platform-admin-overview/valid.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('platform admin API transport [IAM-026, BUA-024, WEB-025]', () => {
  it('reads and validates the server-authoritative overview', async () => {
    const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
    const api = createPlatformAdminApi({
      baseUrl: 'http://localhost',
      fetcher: async (input, init) => {
        calls.push({ url: requestUrl(input), init });
        return new Response(JSON.stringify(validOverview), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const overview = await api.readOverview(180);

    expect(overview.operator.role).toBe('PLATFORM_OWNER');
    expect(calls[0]?.url).toBe('http://localhost/v1/platform-admin/overview?days=180');
    expect(calls[0]?.init?.credentials).toBe('include');
  });

  it('fails closed for tenant-only users and malformed responses', async () => {
    const denied = createPlatformAdminApi({
      baseUrl: 'http://localhost',
      fetcher: async () =>
        new Response(JSON.stringify({ code: 'PLATFORM_ADMIN_FORBIDDEN' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(denied.readOverview(30)).rejects.toEqual(
      expect.objectContaining<Partial<PlatformAdminApiError>>({
        code: 'PLATFORM_ADMIN_FORBIDDEN',
        status: 403,
      }),
    );
    await expect(denied.canAccess()).resolves.toBe(false);

    const malformed = createPlatformAdminApi({
      baseUrl: 'http://localhost',
      fetcher: async () =>
        new Response(
          JSON.stringify({ ...validOverview, sourceContent: 'must not cross boundary' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    });
    await expect(malformed.readOverview(90)).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_RESPONSE_INVALID',
    });
  });
});
