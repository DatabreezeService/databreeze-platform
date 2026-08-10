import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FolderSyncStatus } from '../src/renderer/features/folders/folder-sync-status.tsx';

describe('DDA-039 source unavailable degradation', () => {
  it('renders last-good cloud state with exact freshness reason codes', () => {
    const reasons = [
      'SOURCE_OFFLINE',
      'DEVICE_REVOKED',
      'SOURCE_STALE',
      'AWAITING_REVIEW',
      'AWAITING_SYNC',
    ] as const;

    for (const reason of reasons) {
      const { unmount } = render(
        <FolderSyncStatus
          locale="en"
          lastGoodSnapshotId="01LLLLLLLLLLLLLLLLLLLLLLLL"
          reason={reason}
          syncState="DEGRADED"
        />,
      );
      expect(screen.getByText(reason)).toBeTruthy();
      expect(screen.getByText(/last authorized complete snapshot/i)).toBeTruthy();
      expect(screen.queryByText(/C:\\/i)).toBeNull();
      unmount();
    }
  });

  it('shows Vietnamese copy for offline degradation without inventing fresh data', () => {
    render(
      <FolderSyncStatus
        locale="vi-VN"
        lastGoodSnapshotId="01LLLLLLLLLLLLLLLLLLLLLLLL"
        reason="SOURCE_OFFLINE"
        syncState="DEGRADED"
      />,
    );
    expect(screen.getByText('SOURCE_OFFLINE')).toBeTruthy();
    expect(screen.getByText(/ảnh chụp hoàn chỉnh được ủy quyền gần nhất/i)).toBeTruthy();
  });
});
