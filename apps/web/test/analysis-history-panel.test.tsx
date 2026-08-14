import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AnalysisHistoryPanel } from '../src/features/dashboards/analysis-history-panel.tsx';
import { DashboardWorkspace } from '../src/features/dashboards/dashboard-workspace.tsx';

const authorizedHistory = Object.freeze([
  Object.freeze({
    id: 'dashboard-current',
    kind: 'dashboard' as const,
    title: 'Bảng điều khiển hiện tại',
  }),
  Object.freeze({
    id: 'analysis-revenue-by-region',
    kind: 'analysis' as const,
    title: 'Phân tích doanh thu theo khu vực',
  }),
]);

function MobileHistoryHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        Mở lịch sử phân tích
      </button>
      <AnalysisHistoryPanel
        collapsed={false}
        items={authorizedHistory}
        locale="vi-VN"
        mobileOpen={open}
        onActivate={() => undefined}
        onCollapsedChange={() => undefined}
        onCreate={() => undefined}
        onMobileOpenChange={setOpen}
        triggerRef={triggerRef}
      />
    </>
  );
}

describe('dashboard analysis history', () => {
  it('collapses and restores the history panel with the per-device preference', async () => {
    globalThis.localStorage.removeItem('databreeze.dashboardHistoryCollapsed=v1');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardWorkspace locale="vi-VN">
          <p>Nội dung bảng điều khiển</p>
        </DashboardWorkspace>
      </MemoryRouter>,
    );

    expect(screen.getByRole('complementary', { name: 'Lịch sử phân tích' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'DataBreeze' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Phân tích mới' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thu gọn lịch sử phân tích' }));

    const expandButton = screen.getByRole('button', { name: 'Mở lịch sử phân tích' });
    expect(expandButton.getAttribute('aria-expanded')).toBe('false');
    expect(globalThis.localStorage.getItem('databreeze.dashboardHistoryCollapsed=v1')).toBe('true');

    await user.click(expandButton);
    expect(
      screen
        .getByRole('button', { name: 'Thu gọn lịch sử phân tích' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(globalThis.localStorage.getItem('databreeze.dashboardHistoryCollapsed=v1')).toBe(
      'false',
    );
  });

  it('searches only supplied authorized subjects and never renders a removed subject title', async () => {
    const user = userEvent.setup();
    render(
      <AnalysisHistoryPanel
        activeSubjectId="dashboard-current"
        collapsed={false}
        items={[
          ...authorizedHistory,
          {
            availability: 'removed',
            id: 'removed-subject',
            kind: 'analysis',
            title: 'Tên nguồn không được phép tiết lộ',
          },
        ]}
        locale="vi-VN"
        onActivate={() => undefined}
        onCollapsedChange={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(screen.queryByText('Tên nguồn không được phép tiết lộ')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mục này không còn khả dụng' })).toBeTruthy();

    const search = screen.getByRole('searchbox', { name: 'Tìm lịch sử phân tích' });
    await user.type(search, 'khu vực');

    expect(screen.getByRole('button', { name: 'Phân tích doanh thu theo khu vực' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bảng điều khiển hiện tại' })).toBeNull();
  });

  it('uses a stable error state without loading or exposing additional history data', () => {
    render(
      <AnalysisHistoryPanel
        collapsed={false}
        items={authorizedHistory}
        loadState="error"
        locale="vi-VN"
        onActivate={() => undefined}
        onCollapsedChange={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe(
      'Không thể mở lịch sử phân tích. Quyền hiện tại vẫn được áp dụng.',
    );
    expect(screen.queryByRole('button', { name: 'Bảng điều khiển hiện tại' })).toBeNull();
  });

  it('closes the narrow-screen drawer with Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<MobileHistoryHarness />);
    const trigger = screen.getByRole('button', { name: 'Mở lịch sử phân tích' });

    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Lịch sử phân tích' })).toBeTruthy();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Lịch sử phân tích' })).toBeNull();
      expect(globalThis.document.activeElement).toBe(trigger);
    });
  });
});
