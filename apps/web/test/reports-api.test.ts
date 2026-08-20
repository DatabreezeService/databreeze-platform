import { describe, expect, it, vi } from 'vitest';

import { createReport, listReports } from '../src/features/reports/reports-api.ts';

const reportId = '00000000-0000-4000-8000-000000000921';
const clientId = '00000000-0000-4000-8000-000000000922';
const datasetId = '00000000-0000-4000-8000-000000000923';
const datasetVersionId = '00000000-0000-4000-8000-000000000924';

const summary = {
  schemaVersion: 4,
  reportId,
  name: 'Monthly sales',
  clientId,
  period: '2026-08',
  datasetId,
  datasetVersionId,
  status: 'DRAFT',
  reportVersion: 1,
  updatedAt: '2026-08-18T00:00:00.000Z',
} as const;

describe('reports transport', () => {
  it('parses an exact server-owned list response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 4, accepted: true, items: [summary] }), {
        status: 200,
      }),
    );
    const result = await listReports(
      { limit: 25 },
      { baseUrl: 'https://api.example.test', fetcher },
    );
    expect(result.items[0]?.reportId).toBe(reportId);
    const firstInput = fetcher.mock.calls[0]?.[0];
    expect(
      firstInput instanceof URL
        ? firstInput.toString()
        : typeof firstInput === 'string'
          ? firstInput
          : '',
    ).toContain('/v1/reports?limit=25');
  });

  it('maps authorization failures without inventing an empty list', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(
      listReports({}, { baseUrl: 'https://api.example.test', fetcher }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates create commands before sending them', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createReport(
        {
          schemaVersion: 4,
          name: 'Missing ids',
          clientId: 'bad',
          period: '2026-08',
          datasetId,
          datasetVersionId,
          supportedFormats: ['WEB'],
        } as never,
        'too-short',
        { baseUrl: 'https://api.example.test', fetcher },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts a server-bound report definition with an idempotency key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 4, accepted: true, report: summary }), {
        status: 201,
      }),
    );
    const result = await createReport(
      {
        schemaVersion: 4,
        name: summary.name,
        clientId,
        period: summary.period,
        datasetId,
        datasetVersionId,
        supportedFormats: ['WEB'],
      },
      'report-create-2026-08',
      { baseUrl: 'https://api.example.test', fetcher },
    );
    expect(result.reportId).toBe(reportId);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('report-create-2026-08');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      schemaVersion: 4,
      clientId,
      datasetVersionId,
      supportedFormats: ['WEB'],
    });
  });
});
