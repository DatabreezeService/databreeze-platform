import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

const CHART_COLORS = ['#1261e8', '#1fbb78', '#7c45f5', '#ff8a17', '#6f93d8'] as const;
const BAR_COLORS = ['#b8d2fb', '#8db7f7', '#5d98f2', '#337bea', '#0f5fe7'] as const;
const CHART_HEIGHT = 220;
const MAX_TOOLTIP_LABEL_LENGTH = 160;
const MAX_TOOLTIP_UNIT_LENGTH = 32;
const MAX_TOOLTIP_VALUE_LENGTH = 256;

interface RechartsDatumV1 {
  readonly rowId: string;
  readonly label: string;
  readonly value: number;
  readonly tooltipValue: string;
}

interface GovernedTooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly { readonly payload?: unknown }[];
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function chartLabel(locale: SupportedLocaleV1, type: string): string {
  if (type === 'BAR') return label(locale, 'Biểu đồ cột', 'Bar chart');
  if (type === 'LINE') return label(locale, 'Biểu đồ đường', 'Line chart');
  if (type === 'AREA') return label(locale, 'Biểu đồ vùng', 'Area chart');
  if (type === 'PIE') return label(locale, 'Biểu đồ tròn', 'Pie chart');
  return label(locale, 'Biểu đồ vành khuyên', 'Donut chart');
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

function hasValidPartsOfWhole(rows: readonly AuthorizedWidgetResultRowV1[]): boolean {
  let total = 0;
  for (const row of rows) {
    const value = row.numericValue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
    total += value;
  }
  return Number.isFinite(total) && total > 0;
}

function numericFormatter(locale: SupportedLocaleV1): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  });
}

function boundedTooltipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1) + '…';
}

function governedTooltipValue(row: AuthorizedWidgetResultRowV1): string {
  const displayValue = row.displayValue.trim();
  if (row.unit === undefined) {
    return boundedTooltipText(displayValue, MAX_TOOLTIP_VALUE_LENGTH);
  }

  const normalizedUnit = row.unit.trim();
  const unit = boundedTooltipText(row.unit, MAX_TOOLTIP_UNIT_LENGTH);
  if (unit.length === 0) {
    return boundedTooltipText(displayValue, MAX_TOOLTIP_VALUE_LENGTH);
  }

  const hasUnitSuffix =
    normalizedUnit.length > 0 && displayValue.toUpperCase().endsWith(normalizedUnit.toUpperCase());
  const valueWithoutUnit = hasUnitSuffix
    ? displayValue.slice(0, -normalizedUnit.length).trimEnd()
    : displayValue;
  const unitSuffix = ` ${unit}`;
  const valueBudget = MAX_TOOLTIP_VALUE_LENGTH - unitSuffix.length;
  const boundedValue = boundedTooltipText(valueWithoutUnit, valueBudget);

  return boundedValue.length === 0 ? unit : boundedValue + unitSuffix;
}

function toRechartsData(rows: readonly AuthorizedWidgetResultRowV1[]): readonly RechartsDatumV1[] {
  return rows.map((row) => ({
    rowId: row.rowId,
    label: boundedTooltipText(row.label, MAX_TOOLTIP_LABEL_LENGTH),
    value: row.numericValue ?? 0,
    tooltipValue: governedTooltipValue(row),
  }));
}

function isRechartsDatum(value: unknown): value is RechartsDatumV1 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RechartsDatumV1>;
  return typeof candidate.label === 'string' && typeof candidate.tooltipValue === 'string';
}

function GovernedTooltipContent({ active, payload }: GovernedTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (active !== true || !isRechartsDatum(datum)) return null;

  return (
    <div className="recharts-default-tooltip" role="status" aria-live="polite">
      <p className="recharts-tooltip-label">{datum.label}</p>
      <p>{datum.tooltipValue}</p>
    </div>
  );
}

function RechartsFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="dda-native-chart" data-chart-engine="recharts">
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHT}
        minWidth={0}
        initialDimension={{ width: 600, height: CHART_HEIGHT }}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function renderCartesianChart(
  type: 'BAR' | 'LINE' | 'AREA',
  rows: readonly AuthorizedWidgetResultRowV1[],
  locale: SupportedLocaleV1,
) {
  const data = toRechartsData(rows);
  const formatter = numericFormatter(locale);
  const tooltip = <Tooltip content={<GovernedTooltipContent />} isAnimationActive={false} />;
  const axes = (
    <>
      <CartesianGrid stroke="#e7eef8" strokeDasharray="4 5" vertical={false} />
      <XAxis
        dataKey="label"
        axisLine={false}
        interval={0}
        tick={{ className: 'dda-chart-axis-label' }}
        tickLine={false}
      />
      <YAxis
        axisLine={false}
        tickFormatter={(value: number) => formatter.format(value)}
        tick={{ className: 'dda-chart-axis-label' }}
        tickLine={false}
        width={72}
      />
    </>
  );

  if (type === 'BAR') {
    return (
      <RechartsFrame>
        <BarChart<RechartsDatumV1>
          accessibilityLayer
          data={data}
          margin={{ top: 24, right: 16, bottom: 4, left: 0 }}
        >
          {axes}
          {tooltip}
          <Bar
            className="dda-chart-bar"
            dataKey="value"
            isAnimationActive={false}
            maxBarSize={58}
            radius={[8, 8, 0, 0]}
          >
            {data.map((datum, index) => (
              <Cell
                key={datum.rowId}
                fill={BAR_COLORS[Math.min(index, BAR_COLORS.length - 1)] ?? CHART_COLORS[0]}
              />
            ))}
            <LabelList
              className="dda-chart-value-label"
              dataKey="value"
              formatter={(value: unknown) => formatter.format(Number(value))}
              position="top"
            />
          </Bar>
        </BarChart>
      </RechartsFrame>
    );
  }

  if (type === 'LINE') {
    return (
      <RechartsFrame>
        <LineChart<RechartsDatumV1>
          accessibilityLayer
          data={data}
          margin={{ top: 20, right: 18, bottom: 4, left: 0 }}
        >
          {axes}
          {tooltip}
          <Line
            dataKey="value"
            dot={{ fill: '#ffffff', r: 3.5, strokeWidth: 3 }}
            isAnimationActive={false}
            stroke={CHART_COLORS[0]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3.5}
            type="monotone"
          />
        </LineChart>
      </RechartsFrame>
    );
  }

  return (
    <RechartsFrame>
      <AreaChart<RechartsDatumV1>
        accessibilityLayer
        data={data}
        margin={{ top: 20, right: 18, bottom: 4, left: 0 }}
      >
        {axes}
        {tooltip}
        <Area
          dataKey="value"
          dot={{ fill: '#ffffff', r: 3.5, strokeWidth: 3 }}
          fill={CHART_COLORS[0]}
          fillOpacity={0.18}
          isAnimationActive={false}
          stroke={CHART_COLORS[0]}
          strokeWidth={3.5}
          type="monotone"
        />
      </AreaChart>
    </RechartsFrame>
  );
}

function renderCircularChart(
  type: 'PIE' | 'DONUT',
  rows: readonly AuthorizedWidgetResultRowV1[],
  locale: SupportedLocaleV1,
) {
  const data = toRechartsData(rows);
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const formatter = numericFormatter(locale);
  return (
    <RechartsFrame>
      <PieChart accessibilityLayer margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
        <Tooltip content={<GovernedTooltipContent />} isAnimationActive={false} />
        <Pie
          data={data}
          dataKey="value"
          innerRadius={type === 'DONUT' ? 48 : 0}
          isAnimationActive={false}
          nameKey="label"
          outerRadius={78}
          paddingAngle={type === 'DONUT' ? 2 : 0}
          stroke="#ffffff"
          strokeWidth={3}
        >
          {data.map((datum, index) => (
            <Cell
              key={datum.rowId}
              className="dda-chart-donut-segment"
              fill={CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0]}
            />
          ))}
          {type === 'DONUT' ? (
            <Label
              className="dda-chart-donut-total"
              position="center"
              value={formatter.format(total)}
            />
          ) : null}
        </Pie>
        <Legend align="right" iconType="circle" layout="vertical" verticalAlign="middle" />
      </PieChart>
    </RechartsFrame>
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
  const ariaLabel = chartLabel(locale, type) + ': ' + summary;
  return (
    <figure className="dda-chart-figure" role="img" aria-label={ariaLabel}>
      {type === 'BAR' || type === 'LINE' || type === 'AREA'
        ? renderCartesianChart(type, rows, locale)
        : renderCircularChart(type, rows, locale)}
      <figcaption className="dda-visually-hidden">{summary}</figcaption>
    </figure>
  );
}

/** DDA-018/DDA-021: only the V1 catalog maps deterministic result rows to bounded chart components. */
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

  if ((type === 'PIE' || type === 'DONUT') && !hasValidPartsOfWhole(rows)) {
    return (
      <div className="dda-widget-visualization" data-widget-id={widgetId}>
        <p role="status">
          {label(
            locale,
            'Biểu đồ thành phần yêu cầu các giá trị không âm và tổng lớn hơn 0.',
            'Parts-of-whole charts require non-negative values with a total greater than zero.',
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
