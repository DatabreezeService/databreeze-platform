import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('reports readiness surface', () => {
  it('renders the server-owned empty state without inventing report rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ schemaVersion: 4, accepted: true, items: [] }), {
            status: 200,
          }),
        ),
      ),
    );
    const router = createAppRouter({ initialEntries: ['/en/reports'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeTruthy();
    expect(await screen.findByText('No report definitions yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Prepare data/u }).getAttribute('href')).toBe(
      '/en/data',
    );
    expect(screen.queryByText(/reportId|resultManifestId|fake/u)).toBeNull();
  });

  it('loads the next server page when more report definitions are available', async () => {
    const firstPage = {
      schemaVersion: 4,
      accepted: true,
      items: [
        {
          schemaVersion: 4,
          reportId: '00000000-0000-4000-8000-000000000931',
          name: 'First report',
          clientId: '00000000-0000-4000-8000-000000000932',
          period: '2026-08',
          datasetId: '00000000-0000-4000-8000-000000000933',
          datasetVersionId: '00000000-0000-4000-8000-000000000934',
          status: 'DRAFT',
          reportVersion: 1,
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      nextCursor: 'cursor-next-000000',
    };
    const secondPage = {
      schemaVersion: 4,
      accepted: true,
      items: [
        {
          schemaVersion: 4,
          reportId: '00000000-0000-4000-8000-000000000935',
          name: 'Second report',
          clientId: '00000000-0000-4000-8000-000000000936',
          period: '2026-07',
          datasetId: '00000000-0000-4000-8000-000000000937',
          datasetVersionId: '00000000-0000-4000-8000-000000000938',
          status: 'REVIEW',
          reportVersion: 2,
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/reports/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              schemaVersion: 4,
              accepted: true,
              report: {
                ...firstPage.items[0],
                templateId: '00000000-0000-4000-8000-000000000939',
                templateVersion: 1,
                blockCount: 1,
                supportedFormats: ['WEB'],
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(url.includes('cursor-next-000000') ? secondPage : firstPage), {
          status: 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const router = createAppRouter({ initialEntries: ['/en/reports'] });
    render(<ApplicationBoundary router={router} />);

    await screen.findByText('First report');
    expect(
      await screen.findByText(
        'Run generation is not enabled in this workspace yet. The definition is saved safely; a certified run will appear when the execution service is connected.',
      ),
    ).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Load more reports/u })).toBeTruthy();
    screen.getByRole('button', { name: /Load more reports/u }).click();

    expect(await screen.findByText('Second report')).toBeTruthy();
    expect(
      fetcher.mock.calls.some(([input]) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return url.includes('cursor=cursor-next-000000');
      }),
    ).toBe(true);
  });
});
