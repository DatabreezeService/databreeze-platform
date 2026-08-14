import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

function renderDashboard(pathname = '/vi-VN/dashboards') {
  const router = createAppRouter({ initialEntries: [pathname] });
  render(<ApplicationBoundary router={router} />);
  return router;
}

describe('application rail', () => {
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
});
