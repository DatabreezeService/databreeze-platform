import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchStatusBar } from '../src/renderer/workbench/workbench-status-bar.tsx';

describe('Desktop V2 workbench status bar', () => {
  it('shows folder, sync, engine, offline, and review status with non-color text cues in Vietnamese', () => {
    render(
      <WorkbenchStatusBar
        locale="vi-VN"
        offline
        status={{
          folderMonitoring: 'paused',
          syncQueue: 3,
          engineHealth: 'failed',
          pendingReviewCount: 2,
        }}
      />,
    );

    const status = screen.getByRole('status', { name: 'Trạng thái bàn làm việc' });
    expect(status.textContent).toMatch(/Theo dõi thư mục: tạm dừng/u);
    expect(status.textContent).toMatch(/Hàng đồng bộ: 3/u);
    expect(status.textContent).toMatch(/Engine: lỗi/u);
    expect(status.textContent).toMatch(/Ngoại tuyến/u);
    expect(status.textContent).toMatch(/Đánh giá chờ: 2/u);
    expect(status.querySelectorAll('[data-status-cue]').length).toBeGreaterThanOrEqual(4);
  });

  it('renders complete English status labels', () => {
    render(
      <WorkbenchStatusBar
        locale="en"
        offline={false}
        status={{
          folderMonitoring: 'watching',
          syncQueue: 0,
          engineHealth: 'ready',
          pendingReviewCount: 0,
        }}
      />,
    );

    const status = screen.getByRole('status', { name: 'Workbench status' });
    expect(status.textContent).toMatch(/Folder monitoring: watching/u);
    expect(status.textContent).toMatch(/Sync queue: 0/u);
    expect(status.textContent).toMatch(/Engine: ready/u);
    expect(status.textContent).toMatch(/Online/u);
    expect(status.textContent).toMatch(/Pending review: 0/u);
  });
});
