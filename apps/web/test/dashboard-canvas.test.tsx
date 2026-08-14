/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are intentionally `any`. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardCanvas } from '../src/features/dashboards/dashboard-canvas.tsx';
import { WIDGET_CATALOG_V1 } from '../src/features/dashboards/widget-catalog.ts';
import type { DashboardWidgetLayoutsV1 } from '../src/features/dashboards/responsive-widget-grid.tsx';

const draft = {
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  pages: [
    { pageId: '00000000-0000-4000-8000-00000000001c', title: { vi: 'Doanh so', en: 'Sales' } },
  ],
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

const layouts: DashboardWidgetLayoutsV1 = {
  desktop: [
    {
      widgetId: '00000000-0000-4000-8000-00000000001d',
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    },
  ],
  tablet: [
    {
      widgetId: '00000000-0000-4000-8000-00000000001d',
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    },
  ],
  mobile: [
    {
      widgetId: '00000000-0000-4000-8000-00000000001d',
      x: 0,
      y: 0,
      w: 12,
      h: 4,
    },
  ],
};

describe('dashboard canvas [DDA-021][DDA-022]', () => {
  it('exposes allowlisted widgets and chart fallback tables', () => {
    expect(WIDGET_CATALOG_V1.map((entry) => entry.type)).toEqual(
      expect.arrayContaining([
        'KPI',
        'TABLE',
        'BAR',
        'LINE',
        'AREA',
        'PIE',
        'DONUT',
        'TEXT_NOTE',
        'EVIDENCE_NOTE',
      ]),
    );
    render(<DashboardCanvas locale="en" draft={draft} />);
    expect(screen.getByRole('table', { name: 'Chart fallback table' })).toBeTruthy();
    expect(screen.getAllByText('Evidence remains visible').length).toBeGreaterThan(0);
    expect(screen.getByText('Data is fresh')).toBeTruthy();
  });

  it('opens the governed chart conversation from the dashboard header', async () => {
    const user = userEvent.setup();
    const onOpenAgent = vi.fn();
    render(
      <DashboardCanvas
        locale="en"
        draft={draft}
        layouts={layouts}
        header={{
          title: { vi: 'Doanh số khu vực', en: 'Regional sales' },
          dataset: { vi: 'Bán hàng đã cấp quyền', en: 'Authorized sales' },
          autosave: 'SAVED',
        }}
        onOpenAgent={onOpenAgent}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Regional sales' })).toBeTruthy();
    expect(screen.getByText(/Authorized sales/u)).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add chart' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add chart' }));
    expect(onOpenAgent).toHaveBeenCalledTimes(1);
  });

  it('keeps a widget ID stable across keyboard move, remove, and restore on mobile', async () => {
    const user = userEvent.setup();
    const onLayoutCommand = vi.fn();
    const onRemoveWidget = vi.fn();
    const onRestoreWidget = vi.fn();
    render(
      <DashboardCanvas
        locale="en"
        draft={draft}
        breakpoint="mobile"
        layouts={layouts}
        onLayoutCommand={onLayoutCommand}
        onRemoveWidget={onRemoveWidget}
        onRestoreWidget={onRestoreWidget}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Layout actions for Total sales' }));
    await user.click(screen.getByRole('menuitem', { name: 'Increase height' }));
    expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull();
    expect(onLayoutCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'SET_LAYOUT',
        breakpoint: 'mobile',
        cells: expect.arrayContaining([
          expect.objectContaining({
            widgetId: '00000000-0000-4000-8000-00000000001d',
            w: 12,
          }),
        ]),
      }),
    );

    await user.click(screen.getByRole('menuitem', { name: 'Remove widget' }));
    expect(onRemoveWidget).toHaveBeenCalledWith('00000000-0000-4000-8000-00000000001d');
    expect(screen.queryByTestId('widget-00000000-0000-4000-8000-00000000001d')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Restore widget' }));
    expect(onRestoreWidget).toHaveBeenCalledWith('00000000-0000-4000-8000-00000000001d');
    expect(screen.getByTestId('widget-00000000-0000-4000-8000-00000000001d')).toBeTruthy();
    expect(screen.getAllByText('Evidence remains visible').length).toBeGreaterThan(0);
  });

  it('keeps filter scope visible and delegates the typed filter value to its owner', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<DashboardCanvas locale="en" draft={draft} onFilterChange={onFilterChange} />);

    const datasetControl = screen.getByRole('button', { name: 'Protected dataset scope' });
    expect(datasetControl.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: 'region IN' })).toBeNull();
    await user.click(datasetControl);
    expect(datasetControl.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.getByText('Dashboard')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'region IN' }), 'North');
    expect(onFilterChange).toHaveBeenLastCalledWith(
      '00000000-0000-4000-8000-00000000001e',
      'North',
    );
  });

  it('replaces canvas widget values when a live draft version arrives without inventing KPIs', () => {
    const { rerender } = render(<DashboardCanvas locale="en" draft={draft} />);
    expect(screen.getAllByText('1,250,000 VND').length).toBeGreaterThan(0);

    const liveDraft = {
      ...draft,
      versionId: '00000000-0000-4000-8000-000000000099',
      widgets: [
        {
          widgetId: '00000000-0000-4000-8000-00000000001d',
          type: 'KPI',
          pageId: '00000000-0000-4000-8000-00000000001c',
          title: { vi: 'Tong doanh so', en: 'Total sales' },
          values: [{ label: 'amount', value: 'governed-amount' }],
        },
      ],
    };
    rerender(<DashboardCanvas locale="en" draft={liveDraft} />);
    expect(screen.getByText('governed-amount')).toBeTruthy();
    expect(screen.queryAllByText('1,250,000 VND').length).toBe(0);
  });
});
