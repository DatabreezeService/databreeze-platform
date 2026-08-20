import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  WidgetVisualization,
  type AuthorizedWidgetResultRowV1,
} from '../src/features/dashboards/widget-visualization.tsx';

const northAuthorizedRow: AuthorizedWidgetResultRowV1 = {
  rowId: 'north',
  label: 'North',
  numericValue: 1250000,
  displayValue: '1,250,000 VND',
  unit: 'VND',
};

const southAuthorizedRow: AuthorizedWidgetResultRowV1 = {
  rowId: 'south',
  label: 'South',
  numericValue: 920000,
  displayValue: '920,000 VND',
  unit: 'VND',
};

const authorizedRows: readonly AuthorizedWidgetResultRowV1[] = [
  northAuthorizedRow,
  southAuthorizedRow,
];

const rechartsMarkByType = {
  BAR: '.recharts-bar-rectangle',
  LINE: '.recharts-line-curve',
  AREA: '.recharts-area-area',
  PIE: '.recharts-pie-sector',
  DONUT: '.recharts-pie-sector',
} as const;

describe('widget visualization [DDA-018][DDA-021][DDA-026][WEB-014]', () => {
  it.each([
    ['BAR', 'Biểu đồ cột'],
    ['LINE', 'Biểu đồ đường'],
    ['AREA', 'Biểu đồ vùng'],
    ['PIE', 'Biểu đồ tròn'],
    ['DONUT', 'Biểu đồ vành khuyên'],
  ] as const)('localizes the Vietnamese %s accessible chart name', (type, accessibleType) => {
    render(
      <WidgetVisualization
        locale="vi-VN"
        widgetId="regional-sales"
        type={type}
        rows={authorizedRows}
        summary="Doanh số theo vùng"
      />,
    );

    expect(screen.getByRole('img', { name: `${accessibleType}: Doanh số theo vùng` })).toBeTruthy();
    expect(screen.queryByRole('img', { name: new RegExp(type + ' chart', 'i') })).toBeNull();
  });

  it.each(['BAR', 'LINE', 'AREA', 'PIE', 'DONUT'] as const)(
    'renders bounded %s geometry through the responsive Recharts adapter without native SVG geometry',
    (type) => {
      const { container } = render(
        <WidgetVisualization
          locale="en"
          widgetId="regional-sales"
          type={type}
          rows={authorizedRows}
          summary="Regional sales"
        />,
      );

      const figure = screen.getByRole('img', {
        name: new RegExp(type + ' chart: Regional sales', 'i'),
      });
      expect(figure.querySelector('[data-chart-engine="recharts"]')).toBeTruthy();
      expect(figure.querySelector('.recharts-responsive-container')).toBeTruthy();
      expect(figure.querySelector(rechartsMarkByType[type])).toBeTruthy();
      expect(container.querySelector('svg.dda-native-chart')).toBeNull();
    },
  );

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

    let figure = screen.getByRole('img', { name: /Line chart: Regional sales/i });
    expect(figure.textContent).toContain('North');
    expect(figure.textContent).toContain('South');

    rerender(
      <WidgetVisualization
        locale="en"
        widgetId="regional-sales"
        type="DONUT"
        rows={authorizedRows}
        summary="Regional sales"
      />,
    );
    figure = screen.getByRole('img', { name: /Donut chart: Regional sales/i });
    expect(container.querySelector('.recharts-legend-wrapper')).toBeTruthy();
    expect(figure.textContent).toContain('North');
    expect(figure.textContent).toContain('South');
  });

  it('formats deterministic chart values with the selected locale', () => {
    const localizedRows: readonly AuthorizedWidgetResultRowV1[] = [
      {
        rowId: 'localized',
        label: 'Localized',
        numericValue: 1250.5,
        displayValue: 'authoritative display value',
      },
    ];
    const { rerender } = render(
      <WidgetVisualization
        locale="en"
        widgetId="localized-sales"
        type="BAR"
        rows={localizedRows}
        summary="Localized sales"
      />,
    );

    expect(screen.getByRole('img', { name: /Bar chart: Localized sales/i }).textContent).toContain(
      '1,250.5',
    );

    rerender(
      <WidgetVisualization
        locale="vi-VN"
        widgetId="localized-sales"
        type="BAR"
        rows={localizedRows}
        summary="Doanh số theo vùng"
      />,
    );
    expect(
      screen.getByRole('img', { name: /Biểu đồ cột: Doanh số theo vùng/i }).textContent,
    ).toContain('1.250,5');
  });

  it('shows the governed display and unit semantics in an interactive tooltip', () => {
    const { container } = render(
      <WidgetVisualization
        locale="en"
        widgetId="regional-sales"
        type="BAR"
        rows={authorizedRows}
        summary="Regional sales"
      />,
    );

    const surface = container.querySelector('.recharts-surface');
    expect(surface).toBeTruthy();
    fireEvent.focus(surface as Element);
    fireEvent.keyDown(surface as Element, { code: 'ArrowRight', key: 'ArrowRight' });

    const tooltip = container.querySelector('.recharts-tooltip-wrapper');
    expect(tooltip?.textContent).toContain('920,000 VND');
    expect(tooltip?.textContent).not.toContain('Value');
    expect(tooltip?.textContent?.match(/VND/g)).toHaveLength(1);
  });

  it('keeps a long governed tooltip bounded while preserving its unit suffix', () => {
    const longRows: readonly AuthorizedWidgetResultRowV1[] = [
      northAuthorizedRow,
      {
        rowId: 'long',
        label: 'Long value',
        numericValue: 920000,
        displayValue: '9'.repeat(400),
        unit: 'VND',
      },
    ];
    const { container } = render(
      <WidgetVisualization
        locale="en"
        widgetId="long-regional-sales"
        type="BAR"
        rows={longRows}
        summary="Long regional sales"
      />,
    );

    const surface = container.querySelector('.recharts-surface');
    expect(surface).toBeTruthy();
    fireEvent.focus(surface as Element);
    fireEvent.keyDown(surface as Element, { code: 'ArrowRight', key: 'ArrowRight' });

    const tooltipValue = container.querySelector('.recharts-default-tooltip p:last-child');
    expect(tooltipValue?.textContent).toMatch(/ VND$/);
    expect(tooltipValue?.textContent?.match(/VND/g)).toHaveLength(1);
    expect(tooltipValue?.textContent?.length).toBeLessThanOrEqual(256);
  });

  it.each([
    {
      caseName: 'a negative part',
      rows: [
        northAuthorizedRow,
        { ...southAuthorizedRow, numericValue: -1, displayValue: '-1 VND' },
      ],
    },
    {
      caseName: 'a zero total',
      rows: authorizedRows.map((row) => ({ ...row, numericValue: 0, displayValue: '0 VND' })),
    },
  ])('rejects $caseName for PIE and DONUT while retaining the fallback rows', ({ rows }) => {
    const { rerender } = render(
      <WidgetVisualization
        locale="en"
        widgetId="invalid-share"
        type="PIE"
        rows={rows}
        summary="Invalid shares"
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Parts-of-whole charts require non-negative values with a total greater than zero.',
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('table', { name: 'Chart fallback table (VND)' })).toBeTruthy();

    rerender(
      <WidgetVisualization
        locale="en"
        widgetId="invalid-share"
        type="DONUT"
        rows={rows}
        summary="Invalid shares"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Parts-of-whole charts require non-negative values with a total greater than zero.',
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('table', { name: 'Chart fallback table (VND)' })).toBeTruthy();
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
