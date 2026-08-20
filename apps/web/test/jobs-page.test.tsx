import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const job = {
  schemaVersion: 4,
  jobId: '00000000-0000-4000-8000-000000000901',
  actionType: 'analysis.execute',
  actionVersion: 1,
  state: 'SUCCEEDED',
  revision: 3,
  createdAt: '2026-08-13T01:00:00.000Z',
  finishedAt: '2026-08-13T01:00:05.000Z',
  resultAvailable: true,
  approvalState: 'NOT_APPLICABLE',
} as const;

describe('job history surface', () => {
  it('renders server-owned run metadata and keeps internal hashes out of the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((input: string) =>
          Promise.resolve(
            new Response(
              input.includes('/v1/jobs/')
                ? JSON.stringify({ schemaVersion: 4, accepted: true, job })
                : JSON.stringify({ schemaVersion: 4, accepted: true, items: [job] }),
              { status: 200 },
            ),
          ),
        ),
    );
    const router = createAppRouter({ initialEntries: ['/en/jobs'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Runs' })).toBeTruthy();
    expect(await screen.findByText('analysis.execute')).toBeTruthy();
    expect(screen.queryByText(/inputManifestHash|leaseToken|workerId/u)).toBeNull();
  });

  it('shows a guarded retry state instead of pretending there are no runs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    const router = createAppRouter({ initialEntries: ['/en/jobs'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByText('Run history is unavailable.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry safely' })).toBeTruthy();
    expect(screen.queryByText('No runs yet')).toBeNull();
  });
});
