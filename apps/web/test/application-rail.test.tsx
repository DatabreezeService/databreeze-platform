import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const workspaceShellCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/workspace-shell.css'),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = workspaceShellCss.match(new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`, 'u'));
  return match?.[1] ?? '';
}

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

  it('shows only the landing brand mark and a logo-aligned circular arrow collapse handle', async () => {
    renderDashboard();

    const navigation = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(navigation.querySelector('.application-rail__brand-wordmark')).toBeNull();
    expect(navigation.querySelector('.application-rail__brand-icon')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
    expect(
      screen.getByText('DataBreeze', { selector: '.application-rail__brand-name' }),
    ).toBeTruthy();

    const handle = screen.getByRole('button', { name: 'Thu gọn thanh bên' });
    expect(handle.classList.contains('application-rail__collapse')).toBe(true);
    expect(handle.querySelector('.application-rail__collapse-dots')).toBeNull();
    expect(
      handle.querySelector('.application-rail__collapse-arrow')?.getAttribute('data-point'),
    ).toBe('left');

    const brandIcon = cssBlock('.application-rail__brand-icon');
    expect(brandIcon).not.toMatch(/invert/u);
    expect(brandIcon).not.toMatch(/brightness/u);
    expect(cssBlock('.application-rail__brand')).not.toMatch(/background:\s*#fff/u);

    const collapse = cssBlock('.application-rail__collapse');
    expect(cssBlock('.application-rail__header')).toMatch(/position:\s*relative/u);
    expect(collapse).toMatch(/top:\s*50%/u);
    expect(collapse).toMatch(/translate\(50%,\s*-50%\)/u);
    expect(collapse).not.toMatch(/transition:/u);

    const collapseHover = cssBlock('.application-rail__collapse:hover');
    expect(collapseHover).not.toMatch(/transform:/u);
    expect(collapseHover).not.toMatch(/transition:/u);
    expect(workspaceShellCss).not.toContain('translateX(calc(50% + 3px))');
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
    const expandHandle = screen.getByRole('button', { name: 'Mở rộng thanh bên' });
    expect(
      expandHandle.querySelector('.application-rail__collapse-arrow')?.getAttribute('data-point'),
    ).toBe('right');
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
