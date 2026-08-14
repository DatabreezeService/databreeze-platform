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
    <section
      className="dda-filter-bar"
      aria-label={label(locale, 'Bộ lọc bảng điều khiển', 'Dashboard filters')}
    >
      {filters.map((filter) => (
        <label key={filter.filterId} className="dda-filter-bar__filter">
          <span>
            {filter.field === 'region' ? label(locale, 'Khu vực', 'Region') : filter.field}
            <small>
              {filter.scope === 'DASHBOARD'
                ? label(locale, 'Toàn bảng', 'Dashboard')
                : filter.scope}
            </small>
          </span>
          <span id={filter.filterId + '-details'} className="dda-visually-hidden">
            {label(locale, 'Toán tử', 'Operator')}: {filter.operator}.{' '}
            {label(locale, 'Phạm vi', 'Scope')}: {filter.scope}.
          </span>
          <input
            aria-label={`${filter.field} ${filter.operator}`}
            aria-describedby={filter.filterId + '-details'}
            placeholder={label(locale, 'Tất cả', 'All')}
            onChange={(event) => onChange(filter.filterId, event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
