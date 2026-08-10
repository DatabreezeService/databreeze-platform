import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { WIDGET_CATALOG_V1 } from './widget-catalog.ts';

export interface WidgetEditorProps {
  readonly locale: SupportedLocaleV1;
  readonly open: boolean;
  readonly onAdd: (type: string) => void;
  readonly onClose: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-022: keyboard-friendly widget add/configure surface. */
export function WidgetEditor({ locale, open, onAdd, onClose }: WidgetEditorProps) {
  if (!open) return null;
  return (
    <dialog open aria-label={label(locale, 'Thêm tiện ích', 'Add widget')}>
      <h2>{label(locale, 'Danh mục tiện ích', 'Widget catalog')}</h2>
      <ul>
        {WIDGET_CATALOG_V1.map((entry) => (
          <li key={entry.type}>
            <button type="button" onClick={() => onAdd(entry.type)}>
              {entry.type} —{' '}
              {locale === 'vi-VN'
                ? entry.accessibilityDescription.vi
                : entry.accessibilityDescription.en}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose}>
        {label(locale, 'Đóng', 'Close')}
      </button>
    </dialog>
  );
}
