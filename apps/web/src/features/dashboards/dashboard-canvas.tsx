import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { ChartFallbackTable, type ChartFallbackTableRowV1 } from './chart-fallback-table.tsx';
import { DashboardHeader, type DashboardAutosaveStateV1 } from './dashboard-header.tsx';
import { FilterBar } from './filter-bar.tsx';
import {
  ResponsiveWidgetGrid,
  type DashboardSetLayoutCommandV1,
  type DashboardWidgetBreakpointV1,
  type DashboardWidgetLayoutsV1,
} from './responsive-widget-grid.tsx';
import { WidgetFrame } from './widget-frame.tsx';
import type {
  AuthorizedWidgetResultRowV1,
  WidgetVisualizationStateV1,
} from './widget-visualization.tsx';
import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';

const LazyWidgetVisualization = lazy(async () => {
  const module = await import('./widget-visualization.tsx');
  return { default: module.WidgetVisualization };
});

export interface DashboardCanvasHeaderV1 {
  readonly title: { readonly vi: string; readonly en: string };
  readonly dataset: { readonly vi: string; readonly en: string };
  readonly autosave: DashboardAutosaveStateV1;
}

export interface DashboardWidgetResultV1 {
  readonly rows: readonly AuthorizedWidgetResultRowV1[];
  readonly summary: string;
  readonly resultState?: WidgetVisualizationStateV1;
}

export interface DashboardCanvasProps {
  readonly locale: SupportedLocaleV1;
  readonly draft: DashboardDraftFixtureV1;
  readonly breakpoint?: DashboardWidgetBreakpointV1;
  readonly layouts?: DashboardWidgetLayoutsV1;
  readonly header?: DashboardCanvasHeaderV1;
  readonly widgetResults?: Readonly<Record<string, DashboardWidgetResultV1 | undefined>>;
  readonly onOpenAgent?: () => void;
  readonly onLayoutCommand?: (command: DashboardSetLayoutCommandV1) => void;
  readonly onFilterChange?: (filterId: string, value: string) => void;
  readonly onRemoveWidget?: (widgetId: string) => void;
  readonly onRestoreWidget?: (widgetId: string) => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function legacyRows(
  widgetId: string,
  values: readonly { readonly label: string; readonly value: string }[],
): readonly AuthorizedWidgetResultRowV1[] {
  return values.map((value, index) => {
    const rawClean = value.value.replace(/[^0-9.-]/g, '');
    const num = rawClean.length > 0 ? parseFloat(rawClean) : null;
    return {
      rowId: widgetId + '-' + index,
      label: value.label,
      numericValue: num !== null && !isNaN(num) ? num : null,
      displayValue: value.value,
    };
  });
}

function fallbackRows(
  rows: readonly AuthorizedWidgetResultRowV1[],
): readonly ChartFallbackTableRowV1[] {
  return rows.map((row) => ({
    rowId: row.rowId,
    label: row.label,
    displayValue: row.displayValue,
    ...(row.unit === undefined ? {} : { unit: row.unit }),
  }));
}

function defaultHeader(
  draft: DashboardDraftFixtureV1,
  locale: SupportedLocaleV1,
): DashboardCanvasHeaderV1 {
  return {
    title:
      draft.pages[0]?.title ??
      (locale === 'vi-VN'
        ? { vi: 'Bảng điều khiển', en: 'Dashboard' }
        : { vi: 'Bảng điều khiển', en: 'Dashboard' }),
    dataset: {
      vi: 'Phạm vi tập dữ liệu được bảo vệ',
      en: 'Protected dataset scope',
    },
    autosave: 'SAVED',
  };
}

/** DDA-018/DDA-020/DDA-022: canvas presentation never turns display strings into result values or publication commands. */
export function DashboardCanvas({
  locale,
  draft,
  breakpoint,
  layouts,
  header,
  widgetResults,
  onOpenAgent,
  onLayoutCommand,
  onFilterChange,
  onRemoveWidget,
  onRestoreWidget,
}: DashboardCanvasProps) {
  const [widgets, setWidgets] = useState(draft.widgets);
  const [removed, setRemoved] = useState<typeof draft.widgets>([]);
  const [selected, setSelected] = useState<string | undefined>(draft.widgets[0]?.widgetId);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setWidgets(draft.widgets);
    setRemoved([]);
    setSelected(draft.widgets[0]?.widgetId);
  }, [draft.dashboardId, draft.versionId, draft.widgets]);

  const localizedHeader = header ?? defaultHeader(draft, locale);
  const visibleWarning =
    locale === 'vi-VN' && draft.warning.startsWith('Evidence and authorization')
      ? 'Giới hạn bằng chứng và quyền truy cập luôn được hiển thị.'
      : draft.warning;
  const widgetById = useMemo(
    () => new Map(widgets.map((widget) => [widget.widgetId, widget])),
    [widgets],
  );

  function removeWidget(widgetId: string): void {
    const target = widgets.find((widget) => widget.widgetId === widgetId);
    if (target === undefined) return;
    setWidgets((current) => current.filter((widget) => widget.widgetId !== widgetId));
    setRemoved((current) => [target, ...current.filter((widget) => widget.widgetId !== widgetId)]);
    setSelected((current) => (current === widgetId ? undefined : current));
    onRemoveWidget?.(widgetId);
  }

  function restoreWidget(): void {
    const target = removed[0];
    if (target === undefined) return;
    setWidgets((current) =>
      current.some((widget) => widget.widgetId === target.widgetId)
        ? current
        : [...current, target],
    );
    setRemoved((current) => current.slice(1));
    setSelected(target.widgetId);
    onRestoreWidget?.(target.widgetId);
  }

  return (
    <section
      className={
        'dda-dashboard-canvas' + (breakpoint === undefined ? '' : ' dda-breakpoint-' + breakpoint)
      }
      aria-label={label(locale, 'Bề mặt bảng điều khiển', 'Dashboard canvas')}
    >
      <DashboardHeader
        locale={locale}
        title={localizedHeader.title}
        dataset={localizedHeader.dataset}
        freshness={draft.freshness}
        autosave={localizedHeader.autosave}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((open) => !open)}
        {...(onOpenAgent === undefined ? {} : { onOpenAgent })}
      />
      {filtersOpen ? (
        <FilterBar
          locale={locale}
          filters={draft.filters}
          onChange={onFilterChange ?? (() => undefined)}
        />
      ) : null}
      <div className="dda-dashboard-canvas__utility">
        <p role="status" className="dda-dashboard-canvas__trust-note">
          <span aria-hidden="true" />
          {visibleWarning}
        </p>
        <div className="dda-dashboard-canvas__actions">
          <a className="dda-dashboard-canvas__action-link" href={`/${locale}/analysis`}>
            {locale === 'vi-VN' ? 'Hỏi trợ lý AI' : 'Ask AI agent'}
          </a>
          <a className="dda-dashboard-canvas__action-link" href={`/${locale}/data`}>
            {locale === 'vi-VN' ? 'Xem dữ liệu' : 'View data'}
          </a>
          {removed.length > 0 ? (
            <button
              className="dda-dashboard-canvas__restore"
              type="button"
              aria-label={label(locale, 'Khôi phục tiện ích', 'Restore widget')}
              onClick={restoreWidget}
            >
              {label(locale, 'Khôi phục', 'Restore')}
            </button>
          ) : null}
        </div>
      </div>
      <ResponsiveWidgetGrid
        locale={locale}
        widgetIds={widgets.map((widget) => widget.widgetId)}
        {...(breakpoint === undefined ? {} : { breakpoint })}
        {...(layouts === undefined ? {} : { layouts })}
        {...(onLayoutCommand === undefined ? {} : { onLayoutCommand })}
        renderWidget={(widgetId, controls) => {
          const widget = widgetById.get(widgetId);
          if (widget === undefined) return null;
          const result = widgetResults?.[widgetId];
          const rows = result?.rows ?? legacyRows(widget.widgetId, widget.values);
          const summary =
            result?.summary ?? (locale === 'vi-VN' ? widget.title.vi : widget.title.en);

          return (
            <WidgetFrame
              locale={locale}
              widgetId={widget.widgetId}
              type={widget.type}
              title={widget.title}
              values={widget.values}
              selected={selected === widget.widgetId}
              layoutControls={controls}
              onFocus={setSelected}
              onConfigure={setSelected}
              onRemove={removeWidget}
              visualization={
                <Suspense
                  fallback={<ChartFallbackTable locale={locale} rows={fallbackRows(rows)} />}
                >
                  <LazyWidgetVisualization
                    locale={locale}
                    widgetId={widget.widgetId}
                    type={widget.type}
                    rows={rows}
                    summary={summary}
                    {...(result?.resultState === undefined
                      ? {}
                      : { resultState: result.resultState })}
                  />
                </Suspense>
              }
            />
          );
        }}
      />
    </section>
  );
}
