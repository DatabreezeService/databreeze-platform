import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

function renderDashboard(pathname = '/vi-VN/dashboards') {
  const router = createAppRouter({ initialEntries: [pathname] });
  render(<ApplicationBoundary router={router} />);
  return router;
}

describe('application rail', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the three primary destinations as labeled icon navigation and marks the current route', async () => {
    renderDashboard();

    const navigation = await screen.findByRole('navigation', {
      name: 'Điều hướng chính',
    });
    expect(navigation.classList.contains('application-rail')).toBe(true);
    expect(screen.getByRole('link', { name: 'Bảng điều khiển' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dữ liệu' })).toBeTruthy();
  });

  it('removes the old global search strip while retaining dashboard context in the compact top bar', async () => {
    renderDashboard();

    expect((await screen.findAllByRole('banner')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('search', { name: 'Tìm kiếm trong không gian làm việc' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Đường dẫn bảng điều khiển' })).toBeTruthy();
    expect(screen.getByText('Bright Cloud')).toBeTruthy();
    expect(screen.getByText('Bức tranh kinh doanh')).toBeTruthy();
  });

  it('shows only the brand mark and a divider-centered three-dot collapse handle', async () => {
    renderDashboard();

    const navigation = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(navigation.querySelector('.application-rail__brand-wordmark')).toBeNull();
    expect(navigation.querySelector('.application-rail__brand-icon')).toBeTruthy();
    expect(screen.queryByText('DataBreeze', { selector: '.application-rail__brand' })).toBeNull();

    const handle = screen.getByRole('button', { name: 'Thu gọn thanh bên' });
    expect(handle.classList.contains('application-rail__collapse')).toBe(true);
    expect(handle.querySelector('.application-rail__collapse-dots')).toBeTruthy();
  });

  it('starts expanded, collapses to icon-only navigation, and remembers the preference', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(screen.getByRole('link', { name: 'Bảng điều khiển' }).textContent).toContain(
      'Bảng điều khiển',
    );

    await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));

    const navigation = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(navigation.getAttribute('data-collapsed')).toBe('true');
    expect(globalThis.localStorage.getItem('databreeze.sidebar.compact.v1')).toBe('true');
    expect(screen.getByRole('link', { name: 'Bảng điều khiển' }).getAttribute('title')).toBe(
      'Bảng điều khiển',
    );
  });

  it('renders authorized Inbox, Reviews, and Settings as quieter workspace tools', async () => {
    renderDashboard();

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(screen.getByRole('link', { name: 'Hộp thư đến' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nội dung cần xem xét' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cài đặt' })).toBeTruthy();
  });

  it('uses compact sidebar by default at tablet width when no preference exists', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px) and (max-width: 1023px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderDashboard();

    expect(
      (await screen.findByRole('navigation', { name: 'Điều hướng chính' })).getAttribute(
        'data-collapsed',
      ),
    ).toBe('true');
  });

  it('keeps the Dashboard canvas free of analysis-history controls', async () => {
    renderDashboard();

    await screen.findByRole('region', { name: 'Bề mặt bảng điều khiển' });
    expect(screen.queryByRole('button', { name: 'Phân tích mới' })).toBeNull();
    expect(screen.queryByLabelText('Tìm lịch sử phân tích')).toBeNull();
  });
});
