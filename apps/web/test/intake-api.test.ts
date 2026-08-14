import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebIntakeApi } from '../src/features/data-intake/intake-api.ts';

describe('web intake live API [DDA-002]', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends finalize with credentials and fails closed on unauthorized responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createWebIntakeApi('https://api.example.test/v1/dda/web-intake');
    await expect(
      api.finalize({
        sessionId: '00000000-0000-4000-8000-0000000000f1',
        fileName: 'sales.csv',
        claimedMediaType: 'text/csv',
        expectedSha256: 'a'.repeat(64),
        contentBase64: 'bmFtZSxhCmEsMQ==',
      }),
    ).rejects.toThrow('INTAKE_UNAUTHORIZED');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/web-intake/finalize',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('maps unavailable finalize failures without inventing acceptance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const api = createWebIntakeApi('https://api.example.test/v1/dda/web-intake');
    await expect(
      api.finalize({
        sessionId: '00000000-0000-4000-8000-0000000000f1',
        fileName: 'sales.csv',
        claimedMediaType: 'text/csv',
        expectedSha256: 'a'.repeat(64),
        contentBase64: 'bmFtZSxhCmEsMQ==',
      }),
    ).rejects.toThrow('INTAKE_UNAVAILABLE');
  });
});
