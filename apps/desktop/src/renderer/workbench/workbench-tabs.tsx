import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';

export type WorkbenchTabKind =
  | 'dataset'
  | 'original'
  | 'receipt'
  | 'etl-report'
  | 'dashboard'
  | 'analysis';

export type WorkbenchTab = {
  readonly id: string;
  readonly kind: WorkbenchTabKind;
  readonly title: string;
};

export type WorkbenchTabsChange =
  | { readonly type: 'activate'; readonly tabId: string }
  | { readonly type: 'close'; readonly tabId: string }
  | { readonly type: 'restore' };

export type WorkbenchTabsProperties = {
  readonly activeTabId: string | null;
  readonly locale: DesktopLocale;
  readonly tabs: readonly WorkbenchTab[];
  readonly onChange: (change: WorkbenchTabsChange) => void;
};

const LABELS = {
  'vi-VN': {
    list: 'Thẻ bàn làm việc',
    close: (title: string) => `Đóng ${title}`,
    restore: 'Khôi phục thẻ đã đóng',
  },
  en: {
    list: 'Workbench tabs',
    close: (title: string) => `Close ${title}`,
    restore: 'Restore closed tabs',
  },
} as const;

export function WorkbenchTabs({
  activeTabId,
  locale,
  tabs,
  onChange,
}: WorkbenchTabsProperties) {
  const copy = LABELS[locale];

  return (
    <div className="workbench-tabs">
      <div aria-label={copy.list} className="workbench-tabs__list" role="tablist">
        {tabs.map((tab) => (
          <div className="workbench-tabs__item" key={tab.id}>
            <button
              aria-selected={activeTabId === tab.id}
              className="workbench-tabs__tab"
              onClick={() => onChange({ type: 'activate', tabId: tab.id })}
              role="tab"
              type="button"
            >
              {tab.title}
            </button>
            <button
              aria-label={copy.close(tab.title)}
              className="workbench-tabs__close"
              onClick={() => onChange({ type: 'close', tabId: tab.id })}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        className="workbench-tabs__restore"
        onClick={() => onChange({ type: 'restore' })}
        type="button"
      >
        {copy.restore}
      </button>
    </div>
  );
}
