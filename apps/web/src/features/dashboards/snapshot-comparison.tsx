import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface SnapshotComparisonProps {
  readonly locale: SupportedLocaleV1;
  readonly changes: Readonly<
    Record<string, { readonly absolute: number | null; readonly percentage: number | null }>
  >;
  readonly changedWidgets: readonly string[];
  readonly changedInputs: readonly string[];
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-047: snapshot comparison disclosure surface. */
export function SnapshotComparison({
  locale,
  changes,
  changedWidgets,
  changedInputs,
}: SnapshotComparisonProps) {
  return (
    <section aria-label={label(locale, 'So sánh ảnh chụp', 'Snapshot comparison')}>
      <h2>{label(locale, 'So sánh ảnh chụp', 'Snapshot comparison')}</h2>
      <ul>
        {Object.entries(changes).map(([key, change]) => (
          <li key={key}>
            {key}: Δ {change.absolute ?? 'null'} / {change.percentage ?? 'null'}%
          </li>
        ))}
      </ul>
      <p>
        {label(locale, 'Tiện ích đổi', 'Changed widgets')}: {changedWidgets.join(', ') || '—'}
      </p>
      <p>
        {label(locale, 'Đầu vào đổi', 'Changed inputs')}: {changedInputs.join(', ') || '—'}
      </p>
    </section>
  );
}
