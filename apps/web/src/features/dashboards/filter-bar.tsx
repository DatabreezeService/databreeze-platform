import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface FilterBarProps {
  readonly locale: SupportedLocaleV1;
  readonly filters: readonly {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
    readonly scope: string;
  }[];
  readonly onChange: (filterId: string, value: string) => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-023: typed filter bar preserving declared scope. */
export function FilterBar({ locale, filters, onChange }: FilterBarProps) {
  return (
    <section aria-label={label(locale, 'Bộ lọc bảng điều khiển', 'Dashboard filters')}>
      {filters.map((filter) => (
        <label key={filter.filterId}>
          {filter.field} ({filter.scope})
          <input
            aria-label={`${filter.field} ${filter.operator}`}
            onChange={(event) => onChange(filter.filterId, event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
