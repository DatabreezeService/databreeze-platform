import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

function renderShell(pathname: string) {
  const router = createAppRouter({ initialEntries: [pathname] });
  render(<ApplicationBoundary router={router} />);
  return router;
}

describe('locale-aware shell routing', () => {
  it('redirects a missing locale to the canonical Vietnamese dashboards route', async () => {
    const router = renderShell('/dashboards');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vi-VN/dashboards');
    });
    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
  });

  it('resolves an invalid locale deterministically without losing the logical route', async () => {
    const router = renderShell('/fr/jobs');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vi-VN/jobs');
    });
  });

  it('renders complete English navigation and preserves the route when switching locale', async () => {
    const user = userEvent.setup();
    const router = renderShell('/en/analysis?state=open#thread');

    expect(await screen.findByRole('heading', { name: 'Analysis' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Tiếng Việt' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vi-VN/analysis');
      expect(router.state.location.search).toBe('?state=open');
      expect(router.state.location.hash).toBe('#thread');
    });
  });
});

describe('accessible responsive composition', () => {
  it('provides a skip link and named semantic landmarks', async () => {
    renderShell('/vi-VN/dashboards');

    expect(await screen.findByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
    expect(screen.getByRole('main')).toHaveProperty('id', 'main-content');
    expect(
      screen.getByRole('link', { name: 'Bỏ qua để đến nội dung chính' }).getAttribute('href'),
    ).toBe('#main-content');
    expect(screen.getByRole('search', { name: 'Tìm kiếm trong không gian làm việc' })).toBeTruthy();
  });

  it('opens mobile navigation from the keyboard and exposes its controlled state', async () => {
    const originalMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(max-width: 767px)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));

    try {
      const user = userEvent.setup();
      renderShell('/vi-VN/dashboards');
      const menuButton = await screen.findByRole('button', { name: 'Mở điều hướng' });
      expect(menuButton.getAttribute('aria-expanded')).toBe('false');

      menuButton.focus();
      expect(globalThis.document.activeElement).toBe(menuButton);
      await user.keyboard('{Enter}');

      expect(menuButton.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
    } finally {
      globalThis.matchMedia = originalMatchMedia;
    }
  });
});
