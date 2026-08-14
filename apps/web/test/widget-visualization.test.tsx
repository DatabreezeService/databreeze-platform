import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  WidgetVisualization,
  type AuthorizedWidgetResultRowV1,
} from '../src/features/dashboards/widget-visualization.tsx';

const authorizedRows: readonly AuthorizedWidgetResultRowV1[] = [
  {
    rowId: 'north',
    label: 'North',
    numericValue: 1250000,
    displayValue: '1,250,000 VND',
    unit: 'VND',
  },
  {
    rowId: 'south',
    label: 'South',
    numericValue: 920000,
    displayValue: '920,000 VND',
    unit: 'VND',
  },
];

describe('widget visualization [DDA-018][DDA-021][DDA-026][WEB-014]', () => {
  it('keeps category labels visible in the primary line and donut presentations', () => {
    const { container, rerender } = render(
      <WidgetVisualization
        locale="en"
        widgetId="regional-sales"
        type="LINE"
        rows={authorizedRows}
        summary="Regional sales"
      />,
    );

    expect(container.querySelectorAll('.dda-chart-axis-label')).toHaveLength(2);

    rerender(
      <WidgetVisualization
        locale="en"
        widgetId="regional-sales"
        type="DONUT"
        rows={authorizedRows}
        summary="Regional sales"
      />,
    );
    expect(container.querySelector('.dda-chart-legend')).toBeTruthy();
    expect(container.querySelectorAll('.dda-chart-legend__item')).toHaveLength(2);
  });

  it.each(['KPI', 'TABLE', 'BAR', 'LINE', 'AREA', 'PIE', 'DONUT'] as const)(
    'renders the allowlisted %s presentation with the permission-filtered fallback table',
    (type) => {
      render(
        <WidgetVisualization
          locale="en"
          widgetId="regional-sales"
          type={type}
          rows={authorizedRows}
          summary="Regional sales"
        />,
      );

      expect(screen.getByRole('table', { name: 'Chart fallback table (VND)' })).toBeTruthy();
      expect(screen.getAllByText('1,250,000 VND').length).toBeGreaterThan(0);
      if (type === 'KPI' || type === 'TABLE') {
        expect(screen.getByTestId('widget-renderer-' + type)).toBeTruthy();
      } else {
        expect(
          screen.getByRole('img', {
            name: new RegExp(type + ' chart: Regional sales', 'i'),
          }),
        ).toBeTruthy();
      }
    },
  );

  it('does not parse a formatted display string into an authoritative chart number', () => {
    render(
      <WidgetVisualization
        locale="en"
        widgetId="untyped-sales"
        type="BAR"
        rows={[
          {
            rowId: 'north',
            label: 'North',
            numericValue: null,
            displayValue: '1,250,000 VND',
            unit: 'VND',
          },
        ]}
        summary="Regional sales"
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Structured numeric data is required before this chart can be shown.',
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('cell', { name: '1,250,000 VND' })).toBeTruthy();
  });

  it('shows stable explicit states instead of fabricating unknown, denied, and stale charts', () => {
    const { rerender } = render(
      <WidgetVisualization
        locale="en"
        widgetId="unknown"
        type="UNSAFE_SCRIPT"
        rows={authorizedRows}
        summary="Regional sales"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('This widget type is not supported.');
    expect(screen.queryByRole('img')).toBeNull();

    rerender(
      <WidgetVisualization
        locale="en"
        widgetId="denied"
        type="BAR"
        rows={authorizedRows}
        resultState="DENIED"
        summary="Regional sales"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'This result is not available in the current permission scope.',
    );
    expect(screen.queryByText('1,250,000 VND')).toBeNull();

    rerender(
      <WidgetVisualization
        locale="en"
        widgetId="stale"
        type="BAR"
        rows={authorizedRows}
        resultState="STALE"
        summary="Regional sales"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'This result is stale; the last authorized result remains visible.',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
