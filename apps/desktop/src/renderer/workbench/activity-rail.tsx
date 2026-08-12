import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type { WorkbenchActivity } from '../../shared/workbench-contract-v1.ts';

export type ActivityRailProperties = {
  readonly activity: WorkbenchActivity;
  readonly collapsed: boolean;
  readonly locale: DesktopLocale;
  readonly onActivityChange: (activity: WorkbenchActivity) => void;
  readonly onCollapsedChange: (collapsed: boolean) => void;
};

const ACTIVITIES = ['dashboard', 'analysis', 'data', 'reviews', 'settings'] as const;

const LABELS = {
  'vi-VN': {
    nav: 'Hoạt động bàn làm việc',
    collapse: 'Thu gọn thanh hoạt động',
    expand: 'Mở rộng thanh hoạt động',
    dashboard: 'Bảng điều khiển',
    analysis: 'Phân tích',
    data: 'Dữ liệu',
    reviews: 'Đánh giá',
    settings: 'Cài đặt',
  },
  en: {
    nav: 'Workbench activities',
    collapse: 'Collapse activity rail',
    expand: 'Expand activity rail',
    dashboard: 'Dashboard',
    analysis: 'Analysis',
    data: 'Data',
    reviews: 'Reviews',
    settings: 'Settings',
  },
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function ActivityRail({
  activity,
  collapsed,
  locale,
  onActivityChange,
  onCollapsedChange,
}: ActivityRailProperties) {
  const copy = LABELS[locale];
  const motionClass = prefersReducedMotion() ? '' : ' activity-rail--motion';

  return (
    <nav
      aria-label={copy.nav}
      className={`activity-rail${collapsed ? ' activity-rail--collapsed' : ''}${motionClass}`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <button
        className="activity-rail__collapse"
        onClick={() => onCollapsedChange(!collapsed)}
        type="button"
      >
        {collapsed ? copy.expand : copy.collapse}
      </button>
      <ul className="activity-rail__list">
        {ACTIVITIES.map((item) => (
          <li key={item}>
            <button
              aria-current={activity === item ? 'page' : undefined}
              className={
                activity === item
                  ? 'activity-rail__item activity-rail__item--active'
                  : 'activity-rail__item'
              }
              onClick={() => onActivityChange(item)}
              type="button"
            >
              {copy[item]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
