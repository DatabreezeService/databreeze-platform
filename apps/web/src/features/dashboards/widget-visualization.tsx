import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { ChartFallbackTable, type ChartFallbackTableRowV1 } from './chart-fallback-table.tsx';
import { findWidgetCatalogEntry } from './widget-catalog.ts';

export interface AuthorizedWidgetResultRowV1 extends ChartFallbackTableRowV1 {
  /**
   * Bounded deterministic result-cell value. Display strings remain display-only
   * and are never parsed to create an authoritative value.
   */
  readonly numericValue: number | null;
  readonly provenance?: {
    readonly planId: string;
    readonly metricId?: string;
    readonly evidenceRef?: string;
  };
}

export type WidgetVisualizationStateV1 =
  | 'READY'
  | 'EMPTY'
  | 'SAMPLED'
  | 'TRUNCATED'
  | 'DENIED'
  | 'STALE';

export interface WidgetVisualizationProps {
  readonly locale: SupportedLocaleV1;
  readonly widgetId: string;
  readonly type: string;
  readonly rows: readonly AuthorizedWidgetResultRowV1[];
  readonly summary: string;
  readonly resultState?: WidgetVisualizationStateV1;
}

const CHART_COLORS = ['#0f5fe7', '#20b873', '#8b4cf6', '#ff8a16', '#6884d8'] as const;

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function chartLabel(type: string): string {
  if (type === 'BAR') return 'Bar';
  if (type === 'LINE') return 'Line';
  if (type === 'AREA') return 'Area';
  if (type === 'PIE') return 'Pie';
  return 'Donut';
}

function resultStateMessage(
  locale: SupportedLocaleV1,
  state: Exclude<WidgetVisualizationStateV1, 'READY'>,
): string {
  if (state === 'EMPTY') {
    return label(
      locale,
      'Không có hàng được cấp quyền cho biểu đồ này.',
      'There are no authorized rows for this visualization.',
    );
  }
  if (state === 'SAMPLED') {
    return label(
      locale,
      'Kết quả này là mẫu và không thể hiển thị như biểu đồ đầy đủ.',
      'This result is sampled and cannot be shown as a complete chart.',
    );
  }
  if (state === 'TRUNCATED') {
    return label(
      locale,
      'Kết quả bị cắt bớt và không thể hiển thị như biểu đồ đầy đủ.',
      'This result is truncated and cannot be shown as a complete chart.',
    );
  }
  if (state === 'DENIED') {
    return label(
      locale,
      'Kết quả này không khả dụng trong phạm vi quyền hiện tại.',
      'This result is not available in the current permission scope.',
    );
  }
  return label(
    locale,
    'Kết quả này đã cũ; kết quả được cấp quyền gần nhất vẫn được hiển thị.',
    'This result is stale; the last authorized result remains visible.',
  );
}

function hasBoundedNumbers(rows: readonly AuthorizedWidgetResultRowV1[]): boolean {
  return (
    rows.length > 0 &&
    rows.every((row) => typeof row.numericValue === 'number' && Number.isFinite(row.numericValue))
  );
}

function numericFormatter(locale: SupportedLocaleV1): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  });
}

function renderCartesianChart(
  type: 'BAR' | 'LINE' | 'AREA',
  rows: readonly AuthorizedWidgetResultRowV1[],
  locale: SupportedLocaleV1,
) {
  const max = Math.max(...rows.map((row) => row.numericValue ?? 0), 1);
  const points = rows.map((row, index) => {
    const x = 32 + (index * 536) / Math.max(rows.length - 1, 1);
    const y = 188 - ((row.numericValue ?? 0) / max) * 150;
    return { x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const formatter = numericFormatter(locale);
  return (
    <svg className="dda-native-chart" viewBox="0 0 600 220" role="presentation">
      {[38, 88, 138, 188].map((y) => (
        <line key={y} x1="32" y1={y} x2="568" y2={y} stroke="#e8eef7" strokeWidth="1" />
      ))}
      {type === 'BAR'
        ? rows.map((row, index) => {
            const width = Math.min(64, 480 / Math.max(rows.length, 1));
            const x = 48 + (index * 504) / Math.max(rows.length, 1);
            const height = ((row.numericValue ?? 0) / max) * 150;
            return (
              <rect
                key={row.rowId}
                x={x}
                y={188 - height}
                width={width}
                height={height}
                rx="4"
                fill={CHART_COLORS[0]}
              />
            );
          })
        : null}
      {type === 'LINE' || type === 'AREA' ? (
        <polygon
          points={`32,188 ${linePoints} 568,188`}
          fill={CHART_COLORS[0]}
          opacity={type === 'AREA' ? '0.24' : '0.08'}
        />
      ) : null}
      {type === 'LINE' || type === 'AREA' ? (
        <>
          <polyline
            points={linePoints}
            fill="none"
            stroke={CHART_COLORS[0]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <circle
              key={rows[index]?.rowId}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#ffffff"
              stroke={CHART_COLORS[0]}
              strokeWidth="3"
            />
          ))}
        </>
      ) : null}
      {rows.map((row, index) => (
        <text
          key={row.rowId}
          className="dda-chart-axis-label"
          x={points[index]?.x ?? 32}
          y="211"
          textAnchor="middle"
        >
          {row.label}
        </text>
      ))}
      <title>{formatter.format(max)}</title>
    </svg>
  );
}

function renderCircularChart(
  type: 'PIE' | 'DONUT',
  rows: readonly AuthorizedWidgetResultRowV1[],
  locale: SupportedLocaleV1,
) {
  const total = rows.reduce((sum, row) => sum + (row.numericValue ?? 0), 0) || 1;
  let offset = 0;
  const segments = rows.map((row, index) => {
    const start = offset;
    offset += ((row.numericValue ?? 0) / total) * Math.PI * 2;
    return {
      row,
      start,
      end: offset,
      color: CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0],
    };
  });
  return (
    <svg className="dda-native-chart" viewBox="0 0 600 220" role="presentation">
      {segments.map(({ row, start, end, color }) => {
        const startX = 110 + 78 * Math.cos(start - Math.PI / 2);
        const startY = 110 + 78 * Math.sin(start - Math.PI / 2);
        const endX = 110 + 78 * Math.cos(end - Math.PI / 2);
        const endY = 110 + 78 * Math.sin(end - Math.PI / 2);
        const largeArc = end - start > Math.PI ? 1 : 0;
        return (
          <path
            key={row.rowId}
            d={`M110 110 L${startX} ${startY} A78 78 0 ${largeArc} 1 ${endX} ${endY} Z`}
            fill={color}
          />
        );
      })}
      {type === 'DONUT' ? <circle cx="110" cy="110" r="54" fill="white" /> : null}
      {type === 'DONUT' ? (
        <>
          <text className="dda-chart-donut-total" x="110" y="107" textAnchor="middle">
            {numericFormatter(locale).format(total)}
          </text>
          <text className="dda-chart-donut-caption" x="110" y="126" textAnchor="middle">
            {label(locale, 'Tổng', 'Total')}
          </text>
        </>
      ) : null}
      <g className="dda-chart-legend">
        {segments.map(({ row, color }, index) => (
          <g
            key={row.rowId}
            className="dda-chart-legend__item"
            transform={`translate(238 ${58 + index * 34})`}
          >
            <circle cx="6" cy="-4" r="6" fill={color} />
            <text className="dda-chart-legend__label" x="24" y="0">
              {row.label}
            </text>
            <text className="dda-chart-legend__value" x="328" y="0" textAnchor="end">
              {row.displayValue}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ChartFigure({
  type,
  rows,
  summary,
  locale,
}: {
  readonly type: 'BAR' | 'LINE' | 'AREA' | 'PIE' | 'DONUT';
  readonly rows: readonly AuthorizedWidgetResultRowV1[];
  readonly summary: string;
  readonly locale: SupportedLocaleV1;
}) {
  const ariaLabel = chartLabel(type) + ' chart: ' + summary;
  return (
    <figure className="dda-chart-figure" role="img" aria-label={ariaLabel}>
      {type === 'BAR' || type === 'LINE' || type === 'AREA'
        ? renderCartesianChart(type, rows, locale)
        : renderCircularChart(type, rows, locale)}
      <figcaption className="dda-visually-hidden">{summary}</figcaption>
    </figure>
  );
}

/** DDA-018/DDA-021: only the V1 catalog maps deterministic result rows to bounded SVG components. */
export function WidgetVisualization({
  locale,
  widgetId,
  type,
  rows,
  summary,
  resultState = 'READY',
}: WidgetVisualizationProps) {
  const catalog = findWidgetCatalogEntry(type);
  const fallbackRows = resultState === 'DENIED' ? [] : rows;

  if (catalog === undefined) {
    return (
      <div className="dda-widget-visualization" data-widget-id={widgetId}>
        <p role="alert">
          {label(
            locale,
            'Loại tiện ích này không được hỗ trợ.',
            'This widget type is not supported.',
          )}
        </p>
        <ChartFallbackTable locale={locale} rows={fallbackRows} />
      </div>
    );
  }

  if (resultState !== 'READY') {
    return (
      <div className="dda-widget-visualization" data-widget-id={widgetId}>
        <p role="status">{resultStateMessage(locale, resultState)}</p>
        <ChartFallbackTable locale={locale} rows={fallbackRows} />
      </div>
    );
  }

  if (type === 'TABLE') {
    return (
      <div className="dda-widget-visualization" data-testid="widget-renderer-TABLE">
        <ChartFallbackTable locale={locale} rows={rows} />
      </div>
    );
  }

  if (type === 'TEXT_NOTE' || type === 'EVIDENCE_NOTE') {
    return (
      <div className="dda-widget-visualization" data-testid={'widget-renderer-' + type}>
        {rows.map((row) => (
          <p key={row.rowId}>{row.displayValue}</p>
        ))}
        <ChartFallbackTable locale={locale} rows={rows} />
      </div>
    );
  }

  if (!hasBoundedNumbers(rows)) {
    return (
      <div className="dda-widget-visualization" data-widget-id={widgetId}>
        <p role="status">
          {label(
            locale,
            'Cần dữ liệu số có cấu trúc trước khi có thể hiển thị biểu đồ này.',
            'Structured numeric data is required before this chart can be shown.',
          )}
        </p>
        <ChartFallbackTable locale={locale} rows={rows} />
      </div>
    );
  }

  if (type === 'KPI') {
    const first = rows[0];
    if (first === undefined) {
      return (
        <div className="dda-widget-visualization" data-widget-id={widgetId}>
          <p role="status">
            {label(
              locale,
              'Không có hàng được cấp quyền cho biểu đồ này.',
              'There are no authorized rows for this visualization.',
            )}
          </p>
          <ChartFallbackTable locale={locale} rows={rows} />
        </div>
      );
    }
    return (
      <div className="dda-widget-visualization dda-kpi-renderer" data-testid="widget-renderer-KPI">
        <p className="dda-kpi-value">{first.displayValue}</p>
        <p className="dda-kpi-label">{first.label}</p>
        <ChartFallbackTable locale={locale} rows={rows} />
      </div>
    );
  }

  if (type === 'BAR' || type === 'LINE' || type === 'AREA' || type === 'PIE' || type === 'DONUT') {
    return (
      <div className="dda-widget-visualization">
        <ChartFigure type={type} rows={rows} summary={summary} locale={locale} />
        <ChartFallbackTable locale={locale} rows={rows} />
      </div>
    );
  }

  return (
    <div className="dda-widget-visualization" data-widget-id={widgetId}>
      <p role="alert">
        {label(
          locale,
          'Loại tiện ích này không được hỗ trợ.',
          'This widget type is not supported.',
        )}
      </p>
      <ChartFallbackTable locale={locale} rows={fallbackRows} />
    </div>
  );
}
