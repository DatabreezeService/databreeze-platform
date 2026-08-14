import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analysisLiveConfiguration,
  proposeAnalysisPlan,
} from '../src/features/dashboards/analysis-api.ts';

describe('analysis live API [DDA-015]', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an API base URL before proposing live analysis plans', () => {
    expect(analysisLiveConfiguration({})).toBeUndefined();
    expect(
      analysisLiveConfiguration({
        VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/',
      }),
    ).toEqual({ baseUrl: 'https://api.example.test' });
  });

  it('proposes through the governed analysis endpoint with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          value: {
            plan: {
              planVersionId: '00000000-0000-4000-8000-000000000041',
            },
            preview: {
              datasets: [],
              semanticVersionId: '00000000-0000-4000-8000-000000000000',
              metricVersionId: '00000000-0000-4000-8000-000000000000',
              dimensions: [],
              filters: [],
              timeRange: {
                start: '2026-01-01T00:00:00.000Z',
                end: '2026-12-31T23:59:59.000Z',
              },
              timeGrain: 'MONTH',
              joins: [],
              units: {},
              assumptions: ['Awaiting authorized datasets'],
              output: { form: 'TABLE', maxRows: 100 },
              estimate: { cpuMs: 0, memoryMb: 0 },
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await proposeAnalysisPlan({
      baseUrl: 'https://api.example.test',
      question: 'Doanh so theo region?',
    });

    expect(result.planVersionId).toBe('00000000-0000-4000-8000-000000000041');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/analysis/propose',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('fails closed when analysis proposal is unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(
      proposeAnalysisPlan({
        baseUrl: 'https://api.example.test',
        question: 'Sales by region?',
      }),
    ).rejects.toThrow('ANALYSIS_PROPOSAL_UNAUTHORIZED');
  });
});
