import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsPage } from '../src/features/settings/workspace-settings-page.tsx';
import { MemberAccessTable } from '../src/features/settings/member-access-table.tsx';
import { SessionList } from '../src/features/settings/session-list.tsx';

describe('workspace settings', () => {
  it('denies Viewer mutations and shows English settings chrome', () => {
    render(<WorkspaceSettingsPage locale="en" canManage={false} />);
    expect(screen.getByRole('status').textContent).toContain(
      'You can view settings but cannot change them.',
    );
  });

  it('lists members and sessions when management is allowed', () => {
    render(
      <>
        <WorkspaceSettingsPage locale="vi-VN" canManage />
        <MemberAccessTable
          locale="vi-VN"
          rows={[
            {
              memberId: 'm1',
              displayName: 'An',
              preset: 'Owner',
              agentGrant: 'APPLY_CONFIRMED_CHANGES',
            },
          ]}
        />
        <SessionList
          locale="vi-VN"
          sessions={[{ sessionId: 's1', deviceLabel: 'Laptop', current: true }]}
          onRevoke={() => undefined}
        />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Cài đặt không gian làm việc' })).toBeTruthy();
    expect(screen.getAllByRole('table', { name: 'Bảng quyền thành viên' })).toHaveLength(2);
    expect(screen.getByText('Áp dụng thay đổi đã xác nhận')).toBeTruthy();
    expect(screen.getAllByRole('list', { name: 'Danh sách phiên đăng nhập' })).toHaveLength(2);
  });

  it('renders canonical agent grants as localized labels without role-derived controls', () => {
    render(
      <MemberAccessTable
        locale="vi-VN"
        rows={[
          { memberId: 'none', displayName: 'None', preset: 'Viewer' },
          { memberId: 'analyze', displayName: 'Analyze', preset: 'Viewer', agentGrant: 'ANALYZE' },
          {
            memberId: 'propose',
            displayName: 'Propose',
            preset: 'Editor',
            agentGrant: 'PROPOSE_CHANGES',
          },
          {
            memberId: 'apply',
            displayName: 'Apply',
            preset: 'Viewer',
            agentGrant: 'APPLY_CONFIRMED_CHANGES',
          },
        ]}
      />,
    );

    expect(screen.getByText('Không có quyền trợ lý')).toBeTruthy();
    expect(screen.getByText('Phân tích')).toBeTruthy();
    expect(screen.getByText('Đề xuất thay đổi')).toBeTruthy();
    expect(screen.getByText('Áp dụng thay đổi đã xác nhận')).toBeTruthy();
    expect(screen.queryByText('NONE')).toBeNull();
    expect(screen.queryByText('ANALYZE')).toBeNull();
    expect(screen.queryByText('PROPOSE_CHANGES')).toBeNull();
    expect(screen.queryByText('APPLY_CONFIRMED_CHANGES')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('uses the Viewer NONE default and keeps English labels complete', () => {
    render(
      <MemberAccessTable
        locale="en"
        rows={[
          { memberId: 'viewer', displayName: 'Viewer', preset: 'Viewer' },
          {
            memberId: 'editor',
            displayName: 'Editor',
            preset: 'Editor',
            agentGrant: 'PROPOSE_CHANGES',
          },
        ]}
      />,
    );

    expect(screen.getByText('No agent access')).toBeTruthy();
    expect(screen.getByText('Propose changes')).toBeTruthy();
    expect(screen.queryByText('PROPOSE_CHANGES')).toBeNull();
  });

  it('shows revision-bound grant controls only for an authorized owner', async () => {
    const user = userEvent.setup();
    const onGrantChange = vi.fn();
    render(
      <MemberAccessTable
        locale="en"
        canManage
        onAgentGrantChange={onGrantChange}
        rows={[
          {
            memberId: 'editor',
            displayName: 'Editor',
            preset: 'Editor',
            agentGrant: 'ANALYZE',
            agentGrantRevision: 4,
          },
          { memberId: 'viewer', displayName: 'Viewer', preset: 'Viewer', agentGrant: 'NONE' },
        ]}
      />,
    );

    const control = screen.getByRole('combobox', { name: 'Agent access for Editor' });
    await user.selectOptions(control, 'PROPOSE_CHANGES');
    expect(onGrantChange).toHaveBeenCalledWith('editor', 'PROPOSE_CHANGES', 4);
    const viewerControl = screen.getByRole('combobox', { name: 'Agent access for Viewer' });
    expect(viewerControl).toBeTruthy();
    expect([...viewerControl.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'NONE',
      'ANALYZE',
    ]);
  });
});
