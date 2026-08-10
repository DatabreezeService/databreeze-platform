import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { findWidgetCatalogEntry } from './widget-catalog.ts';

export interface WidgetFrameProps {
  readonly locale: SupportedLocaleV1;
  readonly widgetId: string;
  readonly type: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly values: readonly { readonly label: string; readonly value: string }[];
  readonly warning?: string;
  readonly freshness?: string;
  readonly onRemove?: (widgetId: string) => void;
  readonly onConfigure?: (widgetId: string) => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-021/022: accessible widget frame with always-visible evidence fallback table. */
export function WidgetFrame({
  locale,
  widgetId,
  type,
  title,
  values,
  warning,
  freshness,
  onRemove,
  onConfigure,
}: WidgetFrameProps) {
  const catalog = findWidgetCatalogEntry(type);
  const description =
    locale === 'vi-VN'
      ? (catalog?.accessibilityDescription.vi ?? type)
      : (catalog?.accessibilityDescription.en ?? type);

  return (
    <article
      className="dda-widget-frame"
      data-widget-id={widgetId}
      aria-label={`${title[locale === 'vi-VN' ? 'vi' : 'en']} (${description})`}
      tabIndex={0}
    >
      <header>
        <h3>{locale === 'vi-VN' ? title.vi : title.en}</h3>
        <div>
          <button type="button" onClick={() => onConfigure?.(widgetId)}>
            {label(locale, 'Cấu hình', 'Configure')}
          </button>
          <button type="button" onClick={() => onRemove?.(widgetId)}>
            {label(locale, 'Gỡ', 'Remove')}
          </button>
        </div>
      </header>
      <p role="status">{freshness ?? label(locale, 'Độ mới: chưa biết', 'Freshness: unknown')}</p>
      {warning ? <p role="alert">{warning}</p> : null}
      <table aria-label={label(locale, 'Bảng dự phòng biểu đồ', 'Chart fallback table')}>
        <thead>
          <tr>
            <th scope="col">{label(locale, 'Nhãn', 'Label')}</th>
            <th scope="col">{label(locale, 'Giá trị', 'Value')}</th>
          </tr>
        </thead>
        <tbody>
          {values.map((row) => (
            <tr key={`${widgetId}-${row.label}`}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
