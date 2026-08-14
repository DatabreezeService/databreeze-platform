import type { ReactNode } from 'react';
import { useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { ChartFallbackTable, type ChartFallbackTableRowV1 } from './chart-fallback-table.tsx';
import { WIDGET_SPANS, type WidgetGridKeyboardControlsV1 } from './responsive-widget-grid.tsx';
import { findWidgetCatalogEntry } from './widget-catalog.ts';

export interface WidgetFrameProps {
  readonly locale: SupportedLocaleV1;
  readonly widgetId: string;
  readonly type: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly values: readonly { readonly label: string; readonly value: string }[];
  readonly warning?: string;
  readonly freshness?: string;
  readonly visualization?: ReactNode;
  readonly layoutControls?: WidgetGridKeyboardControlsV1;
  readonly selected?: boolean;
  readonly onRemove?: (widgetId: string) => void;
  readonly onConfigure?: (widgetId: string) => void;
  readonly onFocus?: (widgetId: string) => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function layoutActionLabel(locale: SupportedLocaleV1, title: string): string {
  return locale === 'vi-VN' ? 'Tác vụ bố cục cho ' + title : 'Layout actions for ' + title;
}

function fallbackRows(
  widgetId: string,
  values: readonly { readonly label: string; readonly value: string }[],
): readonly ChartFallbackTableRowV1[] {
  return values.map((value, index) => ({
    rowId: widgetId + '-' + index,
    label: value.label,
    displayValue: value.value,
  }));
}

/** DDA-021/DDA-022: frame chrome and keyboard-first controls around governed widget content. */
export function WidgetFrame({
  locale,
  widgetId,
  type,
  title,
  values,
  warning,
  freshness,
  visualization,
  layoutControls,
  selected = false,
  onRemove,
  onConfigure,
  onFocus,
}: WidgetFrameProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const catalog = findWidgetCatalogEntry(type);
  const localizedTitle = locale === 'vi-VN' ? title.vi : title.en;
  const description =
    locale === 'vi-VN'
      ? (catalog?.accessibilityDescription.vi ?? type)
      : (catalog?.accessibilityDescription.en ?? type);
  const menuId = widgetId + '-layout-actions';

  return (
    <article
      className={selected ? 'dda-widget-frame dda-widget-selected' : 'dda-widget-frame'}
      data-testid={'widget-' + widgetId}
      data-widget-id={widgetId}
      data-widget-type={type}
      aria-label={localizedTitle + ' (' + description + ')'}
      tabIndex={0}
      onFocus={() => onFocus?.(widgetId)}
    >
      <header className="dda-widget-frame__header">
        <div>
          <span className="dda-widget-drag-handle" aria-hidden="true">
            ⠿
          </span>
          <h3>{localizedTitle}</h3>
        </div>
        <button
          type="button"
          aria-label={layoutActionLabel(locale, localizedTitle)}
          aria-expanded={actionsOpen}
          aria-controls={menuId}
          onClick={() => setActionsOpen((open) => !open)}
        >
          {label(locale, 'Tác vụ', 'Actions')}
        </button>
      </header>
      {actionsOpen ? (
        <div id={menuId} className="dda-widget-frame__actions" role="menu">
          {onConfigure === undefined ? null : (
            <button type="button" role="menuitem" onClick={() => onConfigure(widgetId)}>
              {label(locale, 'Cấu hình tiện ích', 'Configure widget')}
            </button>
          )}
          {layoutControls === undefined ? null : (
            <>
              <button type="button" role="menuitem" onClick={() => layoutControls.move('left')}>
                {label(locale, 'Di chuyển trái', 'Move left')}
              </button>
              <button type="button" role="menuitem" onClick={() => layoutControls.move('right')}>
                {label(locale, 'Di chuyển phải', 'Move right')}
              </button>
              <button type="button" role="menuitem" onClick={() => layoutControls.move('up')}>
                {label(locale, 'Di chuyển lên', 'Move up')}
              </button>
              <button type="button" role="menuitem" onClick={() => layoutControls.move('down')}>
                {label(locale, 'Di chuyển xuống', 'Move down')}
              </button>
              {WIDGET_SPANS.map((span) => (
                <button
                  key={span}
                  type="button"
                  role="menuitem"
                  onClick={() => layoutControls.setSpan(span)}
                >
                  {label(locale, 'Rộng ' + span + ' cột', 'Width ' + span + ' columns')}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={layoutControls.increaseHeight}>
                {label(locale, 'Tăng chiều cao', 'Increase height')}
              </button>
              <button type="button" role="menuitem" onClick={layoutControls.decreaseHeight}>
                {label(locale, 'Giảm chiều cao', 'Decrease height')}
              </button>
            </>
          )}
          {onRemove === undefined ? null : (
            <button type="button" role="menuitem" onClick={() => onRemove(widgetId)}>
              {label(locale, 'Gỡ tiện ích', 'Remove widget')}
            </button>
          )}
        </div>
      ) : null}
      {freshness === undefined ? null : <p role="status">{freshness}</p>}
      {warning ? <p role="alert">{warning}</p> : null}
      {visualization ?? (
        <ChartFallbackTable locale={locale} rows={fallbackRows(widgetId, values)} />
      )}
    </article>
  );
}
