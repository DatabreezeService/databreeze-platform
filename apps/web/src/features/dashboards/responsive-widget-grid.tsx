import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  GridLayout,
  noCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';

import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import 'react-grid-layout/css/styles.css';
import '../../styles/dashboard-canvas.css';

export const DASHBOARD_GRID_COLUMNS = 12;
export const WIDGET_SPANS = [3, 4, 6, 8, 12] as const;

export type WidgetSpanV1 = (typeof WIDGET_SPANS)[number];
export type DashboardWidgetBreakpointV1 = 'desktop' | 'tablet' | 'mobile';
export type WidgetMoveDirectionV1 = 'left' | 'right' | 'up' | 'down';

export interface DashboardWidgetGridCellV1 {
  readonly widgetId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DashboardWidgetLayoutsV1 {
  readonly desktop: readonly DashboardWidgetGridCellV1[];
  readonly tablet: readonly DashboardWidgetGridCellV1[];
  readonly mobile: readonly DashboardWidgetGridCellV1[];
}

export interface DashboardSetLayoutCommandV1 {
  readonly kind: 'SET_LAYOUT';
  readonly breakpoint: DashboardWidgetBreakpointV1;
  readonly cells: readonly DashboardWidgetGridCellV1[];
}

export interface WidgetGridKeyboardControlsV1 {
  readonly move: (direction: WidgetMoveDirectionV1) => void;
  readonly setSpan: (span: WidgetSpanV1) => void;
  readonly increaseHeight: () => void;
  readonly decreaseHeight: () => void;
}

export interface NormalizedWidgetCellsV1 {
  readonly cells: readonly DashboardWidgetGridCellV1[];
  readonly rejectedWidgetIds: readonly string[];
}

export interface AutomaticWidgetCellRequestV1 {
  readonly widgetId: string;
  readonly span: WidgetSpanV1;
  readonly minH: number;
}

export interface ResponsiveWidgetGridProps {
  readonly locale: SupportedLocaleV1;
  readonly breakpoint?: DashboardWidgetBreakpointV1;
  readonly widgetIds: readonly string[];
  readonly layouts?: DashboardWidgetLayoutsV1;
  readonly onLayoutCommand?: (command: DashboardSetLayoutCommandV1) => void;
  readonly renderWidget: (widgetId: string, controls: WidgetGridKeyboardControlsV1) => ReactNode;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function asInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function supportedSpan(value: number): WidgetSpanV1 {
  const width = asInteger(value, 6);
  for (const span of WIDGET_SPANS) {
    if (width <= span) return span;
  }
  return 12;
}

function collides(left: DashboardWidgetGridCellV1, right: DashboardWidgetGridCellV1): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

function firstAvailableY(
  candidate: DashboardWidgetGridCellV1,
  resolved: readonly DashboardWidgetGridCellV1[],
): number {
  let y = candidate.y;
  for (;;) {
    const positioned = { ...candidate, y };
    const collision = resolved.find((cell) => collides(positioned, cell));
    if (collision === undefined) return y;
    y = Math.max(y + 1, collision.y + collision.h);
  }
}

/** DDA-020/DDA-022: bound cells and deterministically reflow collisions. */
export function normalizeWidgetCells(
  cells: readonly DashboardWidgetGridCellV1[],
): NormalizedWidgetCellsV1 {
  const resolved: DashboardWidgetGridCellV1[] = [];
  const seen = new Set<string>();
  const rejectedWidgetIds: string[] = [];

  for (const rawCell of cells) {
    if (rawCell.widgetId.trim() === '' || seen.has(rawCell.widgetId)) {
      if (!rejectedWidgetIds.includes(rawCell.widgetId)) rejectedWidgetIds.push(rawCell.widgetId);
      continue;
    }
    seen.add(rawCell.widgetId);

    const w = supportedSpan(rawCell.w);
    const candidate: DashboardWidgetGridCellV1 = {
      widgetId: rawCell.widgetId,
      x: clamp(asInteger(rawCell.x, 0), 0, DASHBOARD_GRID_COLUMNS - w),
      y: Math.max(0, asInteger(rawCell.y, 0)),
      w,
      h: Math.max(2, asInteger(rawCell.h, 4)),
    };
    resolved.push({ ...candidate, y: firstAvailableY(candidate, resolved) });
  }

  return Object.freeze({
    cells: Object.freeze(resolved),
    rejectedWidgetIds: Object.freeze(rejectedWidgetIds),
  });
}

/** DDA-022: deterministic horizontal packing for new widgets. */
export function createAutomaticWidgetCells(
  requests: readonly AutomaticWidgetCellRequestV1[],
): readonly DashboardWidgetGridCellV1[] {
  const cells: DashboardWidgetGridCellV1[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const request of requests) {
    const w = supportedSpan(request.span);
    const h = Math.max(2, asInteger(request.minH, 4));
    if (x + w > DASHBOARD_GRID_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    cells.push({ widgetId: request.widgetId, x, y, w, h });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }

  return Object.freeze(cells);
}

/** DDA-022: narrow viewports use a stable top-to-bottom 12-column stack. */
export function createMobileWidgetCells(
  cells: readonly DashboardWidgetGridCellV1[],
): readonly DashboardWidgetGridCellV1[] {
  const ordered = [...cells].sort(
    (left, right) =>
      left.y - right.y || left.x - right.x || left.widgetId.localeCompare(right.widgetId),
  );
  let y = 0;
  return Object.freeze(
    ordered.map((cell) => {
      const stacked = { widgetId: cell.widgetId, x: 0, y, w: 12, h: Math.max(2, cell.h) };
      y += stacked.h;
      return stacked;
    }),
  );
}

function suppliedCells(
  breakpoint: DashboardWidgetBreakpointV1,
  layouts: DashboardWidgetLayoutsV1 | undefined,
): readonly DashboardWidgetGridCellV1[] {
  if (layouts === undefined) return [];
  if (breakpoint === 'desktop') return layouts.desktop;
  if (breakpoint === 'tablet') return layouts.tablet.length > 0 ? layouts.tablet : layouts.desktop;
  if (layouts.mobile.length > 0) return layouts.mobile;
  return layouts.tablet.length > 0 ? layouts.tablet : layouts.desktop;
}

function cellsForBreakpoint(
  widgetIds: readonly string[],
  layouts: DashboardWidgetLayoutsV1 | undefined,
  breakpoint: DashboardWidgetBreakpointV1,
): readonly DashboardWidgetGridCellV1[] {
  const knownIds = new Set(widgetIds);
  const normalized = normalizeWidgetCells(
    suppliedCells(breakpoint, layouts).filter((cell) => knownIds.has(cell.widgetId)),
  );
  const existingIds = new Set(normalized.cells.map((cell) => cell.widgetId));
  const missing = widgetIds
    .filter((widgetId) => !existingIds.has(widgetId))
    .map((widgetId) => ({ widgetId, span: 6 as const, minH: 4 }));
  const cells = normalizeWidgetCells([
    ...normalized.cells,
    ...createAutomaticWidgetCells(missing),
  ]).cells;
  return breakpoint === 'mobile' ? createMobileWidgetCells(cells) : cells;
}

function layoutSignature(cells: readonly DashboardWidgetGridCellV1[]): string {
  return cells.map((cell) => `${cell.widgetId}:${cell.x},${cell.y},${cell.w},${cell.h}`).join('|');
}

function asGridLayout(cells: readonly DashboardWidgetGridCellV1[]): Layout {
  return cells.map((cell) => ({
    i: cell.widgetId,
    x: cell.x,
    y: cell.y,
    w: cell.w,
    h: cell.h,
    minW: 3,
    maxW: DASHBOARD_GRID_COLUMNS,
    minH: 2,
    isBounded: true,
  }));
}

function cellsFromGridLayout(
  layout: Layout,
  currentCells: readonly DashboardWidgetGridCellV1[],
): readonly DashboardWidgetGridCellV1[] {
  const byWidgetId = new Map<string, LayoutItem>(layout.map((item) => [item.i, item]));
  return currentCells.map((cell) => {
    const item = byWidgetId.get(cell.widgetId);
    if (item === undefined) return cell;
    return { widgetId: cell.widgetId, x: item.x, y: item.y, w: item.w, h: item.h };
  });
}

/** DDA-020/DDA-022/WEB-014: governed pointer and keyboard dashboard authoring. */
export function ResponsiveWidgetGrid({
  locale,
  breakpoint,
  widgetIds,
  layouts,
  onLayoutCommand,
  renderWidget,
}: ResponsiveWidgetGridProps) {
  const { width, containerRef } = useContainerWidth({ initialWidth: 1 });
  const resolvedBreakpoint =
    breakpoint ?? (width <= 767 ? 'mobile' : width <= 1023 ? 'tablet' : 'desktop');
  const initialCells = useMemo(
    () => cellsForBreakpoint(widgetIds, layouts, resolvedBreakpoint),
    [layouts, resolvedBreakpoint, widgetIds],
  );
  const [cells, setCells] = useState<readonly DashboardWidgetGridCellV1[]>(initialCells);
  const cellsRef = useRef<readonly DashboardWidgetGridCellV1[]>(initialCells);
  const initialLayoutKey = layoutSignature(initialCells);
  const lastCommittedLayoutKeyRef = useRef(initialLayoutKey);

  useEffect(() => {
    cellsRef.current = initialCells;
    lastCommittedLayoutKeyRef.current = initialLayoutKey;
    setCells(initialCells);
  }, [initialLayoutKey, initialCells]);

  function emitLayout(updatedCells: readonly DashboardWidgetGridCellV1[]): void {
    onLayoutCommand?.({ kind: 'SET_LAYOUT', breakpoint: resolvedBreakpoint, cells: updatedCells });
  }

  function normalizeForBreakpoint(
    nextCells: readonly DashboardWidgetGridCellV1[],
  ): readonly DashboardWidgetGridCellV1[] | undefined {
    const normalized = normalizeWidgetCells(nextCells);
    if (normalized.rejectedWidgetIds.length > 0) return undefined;
    return resolvedBreakpoint === 'mobile'
      ? createMobileWidgetCells(normalized.cells)
      : normalized.cells;
  }

  function setCurrentLayout(nextCells: readonly DashboardWidgetGridCellV1[]): boolean {
    if (layoutSignature(nextCells) === layoutSignature(cellsRef.current)) return false;
    cellsRef.current = nextCells;
    setCells(nextCells);
    return true;
  }

  function applyLayout(nextCells: readonly DashboardWidgetGridCellV1[]): void {
    const bounded = normalizeForBreakpoint(nextCells);
    if (bounded === undefined) return;
    setCurrentLayout(bounded);
    const nextKey = layoutSignature(bounded);
    if (nextKey === lastCommittedLayoutKeyRef.current) return;
    lastCommittedLayoutKeyRef.current = nextKey;
    emitLayout(bounded);
  }

  function stageKeyboardEdit(
    widgetId: string,
    change: (cell: DashboardWidgetGridCellV1) => DashboardWidgetGridCellV1,
  ): void {
    applyLayout(cellsRef.current.map((cell) => (cell.widgetId === widgetId ? change(cell) : cell)));
  }

  function keyboardControlsFor(widgetId: string): WidgetGridKeyboardControlsV1 {
    return {
      move(direction) {
        stageKeyboardEdit(widgetId, (cell) => {
          if (direction === 'left') return { ...cell, x: cell.x - 3 };
          if (direction === 'right') return { ...cell, x: cell.x + 3 };
          if (direction === 'up') return { ...cell, y: cell.y - 1 };
          return { ...cell, y: cell.y + 1 };
        });
      },
      setSpan(span) {
        stageKeyboardEdit(widgetId, (cell) => ({ ...cell, w: span }));
      },
      increaseHeight() {
        stageKeyboardEdit(widgetId, (cell) => ({ ...cell, h: cell.h + 1 }));
      },
      decreaseHeight() {
        stageKeyboardEdit(widgetId, (cell) => ({ ...cell, h: cell.h - 1 }));
      },
    };
  }

  function handleGridLayoutChange(layout: Layout): void {
    const bounded = normalizeForBreakpoint(cellsFromGridLayout(layout, cellsRef.current));
    if (bounded !== undefined) setCurrentLayout(bounded);
  }

  function handleGridLayoutCommit(layout: Layout): void {
    applyLayout(cellsFromGridLayout(layout, cellsRef.current));
  }

  return (
    <section
      className="dda-responsive-widget-grid"
      aria-label={label(locale, 'Lưới tiện ích điều chỉnh được', 'Adjustable widget grid')}
    >
      <div ref={containerRef} className="dda-responsive-widget-grid__container">
        <div
          className="dda-widget-grid__a11y-wrapper"
          role="list"
          aria-label={label(locale, 'Tiện ích bảng điều khiển', 'Dashboard widgets')}
          data-breakpoint={resolvedBreakpoint}
        >
          <GridLayout
            className="dda-widget-grid"
            width={Math.max(width, 1)}
            layout={asGridLayout(cells)}
            gridConfig={{
              cols: DASHBOARD_GRID_COLUMNS,
              rowHeight: 52,
              margin: [12, 12],
              containerPadding: [0, 0],
            }}
            dragConfig={{
              enabled: true,
              bounded: true,
              handle: '.dda-widget-drag-handle',
              cancel:
                '.dda-widget-frame button, .dda-widget-frame input, .dda-widget-frame textarea, .dda-widget-frame select',
            }}
            resizeConfig={{ enabled: true, handles: ['se'] }}
            compactor={noCompactor}
            onLayoutChange={handleGridLayoutChange}
            onDragStop={handleGridLayoutCommit}
            onResizeStop={handleGridLayoutCommit}
          >
            {cells.map((cell) => (
              <div key={cell.widgetId} role="listitem">
                {renderWidget(cell.widgetId, keyboardControlsFor(cell.widgetId))}
              </div>
            ))}
          </GridLayout>
        </div>
      </div>
    </section>
  );
}
