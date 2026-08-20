import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const inboxItem = {
  schemaVersion: 1,
  inboxItemId: '00000000-0000-4000-8000-000000000001',
  artifactVersionId: '00000000-0000-4000-8000-000000000002',
  state: 'NEEDS_REVIEW',
  createdAt: '2026-01-02T00:00:00.000Z',
  revision: 1,
};

describe('governed artifact inbox', () => {
  it('renders server-owned intake state without exposing scope or idempotency data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify([inboxItem]), { status: 200 })),
        ),
    );
    const router = createAppRouter({ initialEntries: ['/en/inbox'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Data Inbox' }, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(await screen.findByText('Needs review', {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(inboxItem.inboxItemId)).toBeTruthy();
    expect(document.querySelector('.inbox-page__table-shell')).toBeTruthy();
    expect(document.querySelector('.inbox-page__table-scroll')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Data Inbox' })).toBeTruthy();
  }, 30_000);

  it('keeps an honest empty state without inventing intake rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 }))),
    );
    const router = createAppRouter({ initialEntries: ['/en/inbox'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('No intake items yet.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getAllByText('No intake items yet.')).toHaveLength(1);
    expect(document.querySelector('.inbox-page__hero .db-status')?.textContent).toContain('0');
    expect(document.querySelector('.inbox-page__empty')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Data Inbox' })).toBeNull();
  }, 30_000);

  it('shows a safe retry state when the API is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('private provider detail'));
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter({ initialEntries: ['/en/inbox'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByText(
        'The Inbox could not load. No changes were sent.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry safely' })).toBeTruthy();
    expect(document.querySelector('.inbox-page__state--error')).toBeTruthy();
    expect(screen.queryByText(/private provider detail/u)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('keeps the loading state truthful while the server request is pending', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => pendingRequest),
    );
    const router = createAppRouter({ initialEntries: ['/en/inbox'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByText('Loading governed intake…', {}, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(document.querySelector('.inbox-page__state--loading')).toBeTruthy();

    resolveRequest?.(new Response('[]', { status: 200 }));
  }, 30_000);
});
