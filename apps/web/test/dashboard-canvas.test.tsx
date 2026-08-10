import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DashboardCanvas } from '../src/features/dashboards/dashboard-canvas.tsx';
import { WIDGET_CATALOG_V1 } from '../src/features/dashboards/widget-catalog.ts';

const draft = {
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  pages: [{ pageId: '00000000-0000-4000-8000-00000000001c', title: { vi: 'Doanh so', en: 'Sales' } }],
  widgets: [
    {
      widgetId: '00000000-0000-4000-8000-00000000001d',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: { vi: 'Tong doanh so', en: 'Total sales' },
      values: [{ label: 'amount', value: '1,250,000 VND' }],
    },
  ],
  filters: [
    {
      filterId: '00000000-0000-4000-8000-00000000001e',
      field: 'region',
      operator: 'IN',
      scope: 'DASHBOARD',
    },
  ],
  freshness: 'Freshness: FRESH',
  warning: 'Evidence remains visible',
};

describe('dashboard canvas [DDA-021][DDA-022]', () => {
  it('exposes allowlisted widgets and chart fallback tables', () => {
    expect(WIDGET_CATALOG_V1.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['KPI', 'TABLE', 'BAR', 'LINE', 'AREA', 'PIE', 'DONUT', 'TEXT_NOTE', 'EVIDENCE_NOTE']),
    );
    render(<DashboardCanvas locale="en" draft={draft} />);
    expect(screen.getByRole('table', { name: 'Chart fallback table' })).toBeTruthy();
    expect(screen.getAllByText('Evidence remains visible').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Freshness: FRESH').length).toBeGreaterThan(0);
  });

  it('supports keyboard-accessible add, remove, and restore without hiding warnings', async () => {
    const user = userEvent.setup();
    render(<DashboardCanvas locale="en" draft={draft} breakpoint="mobile" />);
    await user.click(screen.getByRole('button', { name: 'Add widget' }));
    await user.click(screen.getByRole('button', { name: /TABLE/u }));
    expect(screen.getAllByRole('article').length).toBeGreaterThan(1);
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    expect(screen.getByRole('button', { name: 'Restore widget' })).toBeTruthy();
    expect(screen.getAllByText('Evidence remains visible').length).toBeGreaterThan(0);
  });
});
