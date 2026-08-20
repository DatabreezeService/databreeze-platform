import { describe, expect, it, vi } from 'vitest';

import { DataApiError, fetchAuthorizedDataIndex } from '../src/features/data/data-api.ts';

const baseUrl = 'https://api.example.test';
const datasetId = '00000000-0000-4000-8000-000000000901';
const versionId = '00000000-0000-4000-8000-000000000902';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function datasetIndex() {
  return {
    accepted: true,
    value: {
      datasets: [
        {
          datasetId,
          versionId,
          label: 'Doanh thu cửa hàng',
          status: 'PUBLISHED',
          versionLabel: '2026-08-13T01:02:03.000Z',
          publishedAt: '2026-08-13T01:02:03.000Z',
          fieldCount: 2,
          fieldTypes: ['DECIMAL', 'DATE'],
          health: 'UNKNOWN',
          readiness: 'READY',
        },
      ],
      page: { limit: 25 },
    },
  };
}

function sourcePage() {
  return {
    accepted: true,
    value: {
      datasetId,
      entries: [
        {
          sourceId: '00000000-0000-4000-8000-000000000903',
          safeDisplayLabel: 'sales-august.xlsx',
          sourceType: 'XLSX',
          versionId: '00000000-0000-4000-8000-000000000904',
          status: 'ACTIVE',
          health: 'UNKNOWN',
          originalAction: 'VIEW_SAFE',
        },
      ],
      page: { limit: 5 },
      generatedAt: '2026-08-13T01:02:03.000Z',
    },
  };
}

describe('[DDA-052][WEB-024] authorized data transport', () => {
  it('fetches the tenant-scoped index with credentials and enriches sources without authority fields', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(datasetIndex()))
      .mockResolvedValueOnce(jsonResponse({ accepted: true, value: { imports: [] } }))
      .mockResolvedValueOnce(jsonResponse(sourcePage()));
    vi.stubGlobal('fetch', fetchMock);

    const datasets = await fetchAuthorizedDataIndex({ baseUrl, locale: 'vi-VN' });

    expect(datasets).toHaveLength(1);
    expect(datasets[0]).toMatchObject({
      datasetId,
      versionId,
      label: 'Doanh thu cửa hàng',
      fieldCount: 2,
      fieldTypes: ['DECIMAL', 'DATE'],
      readiness: 'READY',
      status: 'PUBLISHED',
    });
    expect(datasets[0]?.sources?.[0]).toMatchObject({
      sourceId: '00000000-0000-4000-8000-000000000903',
      label: 'sales-august.xlsx',
      originalAction: 'VIEW_SAFE',
    });
    expect(JSON.stringify(datasets)).not.toMatch(
      /tenantScope|organizationId|workspaceId|localPath/u,
    );

    const [indexUrl, indexInit] = fetchMock.mock.calls[0] ?? [];
    expect(indexUrl).toBe(`${baseUrl}/v1/datasets?limit=25`);
    expect(indexInit).toMatchObject({ credentials: 'include', method: 'GET' });
    expect((indexInit as RequestInit).body).toBeUndefined();
    expect(indexUrl as string).not.toMatch(/tenant|actor|membership|permission/u);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/v1/dda/datasets/${datasetId}/sources?limit=5`,
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('rejects a malformed closed index response instead of rendering partial metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({
          accepted: true,
          value: { datasets: [{ datasetId }], page: { limit: 25 } },
        }),
      ),
    );

    await expect(fetchAuthorizedDataIndex({ baseUrl, locale: 'en' })).rejects.toMatchObject({
      code: 'DATASETS_INVALID',
    });
  });

  it.each([401, 403])('fails closed on HTTP %s without using demo data', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: 'hidden' }, status)),
    );

    await expect(fetchAuthorizedDataIndex({ baseUrl, locale: 'vi-VN' })).rejects.toMatchObject({
      code: 'DATASETS_UNAUTHORIZED',
    });
  });

  it('preserves abort behavior for route cleanup', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );
    controller.abort();

    await expect(
      fetchAuthorizedDataIndex({ baseUrl, locale: 'en', signal: controller.signal }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'DATASETS_ABORTED' } satisfies Partial<DataApiError>),
    );
  });
});
