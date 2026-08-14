import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import brandMarkUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';

export type DashboardAutosaveStateV1 = 'SAVING' | 'SAVED' | 'FAILED' | 'CONFLICT';

export interface DashboardHeaderProps {
  readonly locale: SupportedLocaleV1;
  readonly title: { readonly vi: string; readonly en: string };
  readonly dataset: { readonly vi: string; readonly en: string };
  readonly freshness: string;
  readonly autosave: DashboardAutosaveStateV1;
  readonly filtersOpen?: boolean;
  readonly onOpenAgent?: () => void;
  readonly onToggleFilters?: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function autosaveLabel(locale: SupportedLocaleV1, state: DashboardAutosaveStateV1): string {
  if (state === 'SAVING') return label(locale, 'Đang lưu…', 'Saving…');
  if (state === 'SAVED') return label(locale, 'Đã lưu', 'Saved');
  if (state === 'FAILED') return label(locale, 'Không thể lưu', 'Could not save');
  return label(locale, 'Cần giải quyết xung đột', 'Conflict needs attention');
}

function freshnessLabel(locale: SupportedLocaleV1, freshness: string): string {
  const timestamp = freshness.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/u)?.[0];
  const updated =
    timestamp === undefined
      ? undefined
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(timestamp),
        );
  if (/\bFRESH\b/u.test(freshness)) {
    return updated === undefined
      ? label(locale, 'Dữ liệu mới', 'Data is fresh')
      : label(locale, `Dữ liệu mới · Cập nhật ${updated}`, `Fresh · Updated ${updated}`);
  }
  return freshness;
}

/** DDA-020/DDA-033: concise authoring status; it does not publish or change audience. */
export function DashboardHeader({
  locale,
  title,
  dataset,
  freshness,
  autosave,
  filtersOpen = false,
  onOpenAgent,
  onToggleFilters,
}: DashboardHeaderProps) {
  const localizedTitle = locale === 'vi-VN' ? title.vi : title.en;
  const localizedDataset = locale === 'vi-VN' ? dataset.vi : dataset.en;

  return (
    <header className="dda-dashboard-header">
      <div className="dda-dashboard-header__identity">
        <span className="dda-dashboard-header__title-icon">
          <img alt="" height="32" src={brandMarkUrl} width="32" />
        </span>
        <h2>{localizedTitle}</h2>
      </div>
      <div
        className="dda-dashboard-header__status"
        aria-label={label(locale, 'Trạng thái bảng điều khiển', 'Dashboard status')}
      >
        <p role="status">{freshnessLabel(locale, freshness)}</p>
        <p role="status">{autosaveLabel(locale, autosave)}</p>
        <button
          aria-expanded={filtersOpen}
          className="dda-dashboard-header__dataset"
          onClick={onToggleFilters}
          type="button"
        >
          <span>{localizedDataset}</span>
        </button>
        <button type="button" onClick={onOpenAgent}>
          {label(locale, 'Thêm biểu đồ', 'Add chart')}
        </button>
      </div>
    </header>
  );
}
