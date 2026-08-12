import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type { WorkbenchSyncStatus } from '../../shared/workbench-contract-v1.ts';

export type WorkbenchStatusBarProperties = {
  readonly locale: DesktopLocale;
  readonly offline: boolean;
  readonly status: WorkbenchSyncStatus;
};

const LABELS = {
  'vi-VN': {
    region: 'Trạng thái bàn làm việc',
    folder: {
      watching: 'Theo dõi thư mục: đang theo dõi',
      paused: 'Theo dõi thư mục: tạm dừng',
      unavailable: 'Theo dõi thư mục: không khả dụng',
    },
    sync: (count: number) => `Hàng đồng bộ: ${count}`,
    engine: {
      ready: 'Engine: sẵn sàng',
      starting: 'Engine: đang khởi động',
      failed: 'Engine: lỗi',
      'not-installed': 'Engine: chưa cài',
    },
    network: {
      online: 'Trực tuyến',
      offline: 'Ngoại tuyến',
    },
    review: (count: number) => `Đánh giá chờ: ${count}`,
  },
  en: {
    region: 'Workbench status',
    folder: {
      watching: 'Folder monitoring: watching',
      paused: 'Folder monitoring: paused',
      unavailable: 'Folder monitoring: unavailable',
    },
    sync: (count: number) => `Sync queue: ${count}`,
    engine: {
      ready: 'Engine: ready',
      starting: 'Engine: starting',
      failed: 'Engine: failed',
      'not-installed': 'Engine: not installed',
    },
    network: {
      online: 'Online',
      offline: 'Offline',
    },
    review: (count: number) => `Pending review: ${count}`,
  },
} as const;

export function WorkbenchStatusBar({ locale, offline, status }: WorkbenchStatusBarProperties) {
  const copy = LABELS[locale];

  return (
    <footer aria-label={copy.region} className="workbench-status-bar" role="status">
      <span data-status-cue="folder">{copy.folder[status.folderMonitoring]}</span>
      <span data-status-cue="sync">{copy.sync(status.syncQueue)}</span>
      <span data-status-cue="engine">{copy.engine[status.engineHealth]}</span>
      <span data-status-cue="network">{offline ? copy.network.offline : copy.network.online}</span>
      <span data-status-cue="review">{copy.review(status.pendingReviewCount)}</span>
    </footer>
  );
}
