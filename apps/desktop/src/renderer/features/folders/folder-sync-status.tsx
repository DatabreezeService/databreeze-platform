import type { DesktopLocale } from '../../../shared/desktop-contract-v1.ts';

export type FolderSourceReason =
  | 'SOURCE_OFFLINE'
  | 'DEVICE_REVOKED'
  | 'SOURCE_STALE'
  | 'AWAITING_REVIEW'
  | 'AWAITING_SYNC';

const copy = {
  'vi-VN': {
    title: 'Trạng thái đồng bộ thư mục',
    degraded: 'Đang dùng ảnh chụp hoàn chỉnh được ủy quyền gần nhất',
    reason: 'Lý do nguồn/độ tươi',
    snapshot: 'Snapshot gần nhất',
  },
  en: {
    title: 'Folder sync status',
    degraded: 'Showing the last authorized complete snapshot',
    reason: 'Source/freshness reason',
    snapshot: 'Last-good snapshot',
  },
} as const;

export interface FolderSyncStatusProps {
  readonly locale: DesktopLocale;
  readonly lastGoodSnapshotId: string;
  readonly reason: FolderSourceReason;
  readonly syncState: 'READY' | 'DEGRADED' | 'SYNCING';
}

export function FolderSyncStatus({
  locale,
  lastGoodSnapshotId,
  reason,
  syncState,
}: FolderSyncStatusProps) {
  const text = copy[locale];
  return (
    <section aria-labelledby="folder-sync-title" className="folder-sync-status">
      <h2 id="folder-sync-title">{text.title}</h2>
      {syncState === 'DEGRADED' ? <p>{text.degraded}</p> : null}
      <dl>
        <div>
          <dt>{text.reason}</dt>
          <dd>{reason}</dd>
        </div>
        <div>
          <dt>{text.snapshot}</dt>
          <dd className="numeric">{lastGoodSnapshotId}</dd>
        </div>
      </dl>
    </section>
  );
}
