import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter, createWebQueryClient } from '../src/app/app.tsx';

function Crash(): never {
  throw new Error('internal tenant detail must not be shown');
}

describe('safe localized recovery', () => {
  it('renders a localized route error without exposing exception detail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createAppRouter({ initialEntries: ['/vi-VN/debug/route-error'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Không thể mở khu vực này' }, { timeout: 5_000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/internal tenant detail/u)).toBeNull();
    consoleError.mockRestore();
  });

  it('derives English application recovery from the canonical router path', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createAppRouter({ initialEntries: ['/en/workspace'] });

    render(
      <ApplicationBoundary router={router}>
        <Crash />
      </ApplicationBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'The workspace could not start' })).toBeTruthy();
    expect(screen.queryByText(/internal tenant detail/u)).toBeNull();
    consoleError.mockRestore();
  });

  it('provides a localized safe not-found recovery route', async () => {
    const router = createAppRouter({ initialEntries: ['/en/unknown-area'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to workspace' }).getAttribute('href')).toBe(
      '/en/workspace',
    );
  });
});

describe('privacy-conscious server state', () => {
  it('uses bounded query retries and short-lived content-minimized cache defaults', () => {
    const queryClient = createWebQueryClient();
    const queryDefaults = queryClient.getDefaultOptions().queries;
    const mutationDefaults = queryClient.getDefaultOptions().mutations;

    expect(queryDefaults?.gcTime).toBe(5 * 60 * 1_000);
    expect(queryDefaults?.staleTime).toBe(30_000);
    expect(queryDefaults?.refetchOnWindowFocus).toBe(false);
    expect(typeof queryDefaults?.retry).toBe('function');
    if (typeof queryDefaults?.retry === 'function') {
      expect(queryDefaults.retry(0, new Error('temporary'))).toBe(true);
      expect(queryDefaults.retry(2, new Error('temporary'))).toBe(false);
    }
    expect(mutationDefaults?.retry).toBe(false);
  });

  it('does not persist locale, query state, or interaction data in browser storage', async () => {
    const user = userEvent.setup();
    const localSetItem = vi.spyOn(Storage.prototype, 'setItem');
    const router = createAppRouter({ initialEntries: ['/en/jobs'] });
    render(<ApplicationBoundary router={router} />);

    await user.click(await screen.findByRole('link', { name: /English|Tiếng Việt/i }));

    expect(localSetItem).not.toHaveBeenCalled();
  });
});
