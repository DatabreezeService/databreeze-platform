import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('dashboard route composition [DDA-020]', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('renders the approved four-KPI business overview and primary charts in demo mode', async () => {
    vi.stubEnv('VITE_DATABREEZE_DEMO_MODE', 'true');
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Doanh thu (YTD)')).toBeTruthy();
    expect(screen.getByText('Đơn hàng')).toBeTruthy();
    expect(screen.getByText('Giá trị đơn hàng TB')).toBeTruthy();
    expect(screen.getByText('Tỷ lệ hoàn thành')).toBeTruthy();
    expect(screen.getByRole('article', { name: /Doanh thu \(YTD\).*KPI/u })).toBeTruthy();
    expect(screen.getByRole('article', { name: /Đơn hàng.*KPI/u })).toBeTruthy();
    expect(screen.getByRole('article', { name: /Giá trị đơn hàng TB.*KPI/u })).toBeTruthy();
    expect(screen.getByRole('article', { name: /Tỷ lệ hoàn thành.*KPI/u })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Line chart:/u })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Donut chart:/u })).toBeTruthy();
  });

  it('does not render fixture dashboard data when live dashboard configuration is unavailable', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(
      await screen.findByText('Dashboard data is not available. No changes were sent.'),
    ).toBeTruthy();
    expect(screen.queryByText('1,250,000 VND')).toBeNull();
    expect(screen.getByTestId('dashboard-freshness')).toBeTruthy();
    expect(screen.getByTestId('dashboard-evidence-warning')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ask governed data' })).toBeNull();
    expect(screen.queryByRole('search', { name: 'Search this workspace' })).toBeNull();
    expect(screen.getByText('Want a new chart or a change to this one? Talk to me.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open chart assistant' })).toBeTruthy();
  });
});
