import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsPage } from '../src/features/settings/workspace-settings-page.tsx';
import { MemberAccessTable } from '../src/features/settings/member-access-table.tsx';
import { SessionList } from '../src/features/settings/session-list.tsx';
import { NotificationPreferencesSection } from '../src/features/settings/notification-preferences-section.tsx';

function renderSettings(element: ReactElement) {
  return render(<MemoryRouter initialEntries={['/en/settings']}>{element}</MemoryRouter>);
}

describe('workspace settings', () => {
  it('denies Viewer mutations and shows English settings chrome', () => {
    renderSettings(<WorkspaceSettingsPage locale="en" canManage={false} />);
    expect(screen.getByRole('status').textContent).toContain(
      'You can view settings but cannot change them.',
    );
  });

  it('keeps account settings usable when workspace management is forbidden or unavailable', () => {
    renderSettings(
      <WorkspaceSettingsPage
        locale="en"
        state={{ status: 'error', error: 'WORKSPACE_SETTINGS_FORBIDDEN' }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Workspace settings could not load');
    expect(screen.getByRole('heading', { name: 'Identity and security' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open password reset' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Member access table' })).toBeNull();
  });

  it('lists members and sessions when management is allowed', async () => {
    const user = userEvent.setup();
    renderSettings(
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
    await user.click(screen.getByRole('tab', { name: /Thành viên và quyền/u }));
    expect(screen.getAllByRole('table', { name: 'Bảng quyền thành viên' })).toHaveLength(2);
    expect(screen.getByText('Áp dụng thay đổi đã xác nhận')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Bảo mật và phiên/u }));
    expect(screen.getAllByRole('list', { name: 'Danh sách phiên đăng nhập' })).toHaveLength(2);
  });

  it('uses a persistent tabbed settings panel with keyboard topic navigation', async () => {
    const user = userEvent.setup();
    renderSettings(<WorkspaceSettingsPage locale="en" canManage />);

    const accountTab = screen.getByRole('tab', { name: /Account/u });
    const membersTab = screen.getByRole('tab', { name: /Members and access/u });
    expect(screen.getByRole('tablist', { name: 'Administration topics' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(accountTab.getAttribute('aria-selected')).toBe('true');

    accountTab.focus();
    await user.keyboard('{ArrowDown}');
    expect(membersTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(membersTab);
  });

  it('groups compact dialog rows without per-option dividers or the page summary', () => {
    renderSettings(<WorkspaceSettingsPage locale="vi-VN" canManage presentation="dialog" />);

    const settingsPage = screen.getByRole('region', { name: 'Cài đặt không gian làm việc' });
    expect(settingsPage.className).toContain('workspace-settings-page--dialog');
    expect(screen.getByRole('tabpanel').getAttribute('data-settings-compact')).toBe('true');
    expect(screen.queryByLabelText('Tóm tắt không gian làm việc')).toBeNull();
    const accountGroup = document.querySelector('[data-settings-compact-group="account"]');
    expect(accountGroup).toBeTruthy();
    expect(accountGroup?.querySelectorAll('[data-settings-compact-row]')).toHaveLength(7);
    expect(accountGroup?.querySelector('[data-settings-compact-row-divider]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Mở đặt lại' })).toBeTruthy();
  });

  it('uses icon-only topic navigation and switches an error-state dialog between account and notifications', async () => {
    const user = userEvent.setup();
    renderSettings(
      <WorkspaceSettingsPage
        locale="vi-VN"
        notificationPreferencesState="ready"
        presentation="dialog"
        state={{ status: 'error', error: 'WORKSPACE_SETTINGS_UNAVAILABLE' }}
      />,
    );

    const accountTab = screen.getByRole('tab', { name: 'Tài khoản' });
    const notificationsTab = screen.getByRole('tab', { name: 'Thông báo' });
    expect(screen.queryByText('Danh tính và hồ sơ')).toBeNull();
    expect(screen.queryByText('Kênh và thời gian nhận')).toBeNull();
    expect(
      accountTab.querySelector('[data-settings-topic-icon="account"]')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(
      notificationsTab
        .querySelector('[data-settings-topic-icon="notifications"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(accountTab.getAttribute('aria-controls')).toBe('workspace-settings-panel-account');

    await user.click(notificationsTab);
    expect(notificationsTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe(
      'workspace-settings-panel-notifications',
    );
    expect(screen.getByText('Chọn cách bạn muốn được nhắc')).toBeTruthy();
    expect(screen.queryByText('Đổi mật khẩu')).toBeNull();

    await user.click(accountTab);
    expect(accountTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe(
      'workspace-settings-panel-account',
    );
    expect(screen.getByText('Đổi mật khẩu')).toBeTruthy();
    expect(screen.queryByText('Chọn cách bạn muốn được nhắc')).toBeNull();
  });

  it('renders a calm Vietnamese notification status without inventing preference entries', () => {
    render(<NotificationPreferencesSection locale="vi-VN" state="unavailable" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('data-notification-preferences-state')).toBe('unavailable');
    expect(status.textContent).toContain('Tùy chọn thông báo tạm thời chưa khả dụng.');
    expect(screen.queryByText('Xem xét & phê duyệt')).toBeNull();
    expect(screen.queryByText('Trong ứng dụng')).toBeNull();
  });

  it('renders an scannable English notification preferences editor with protected controls', () => {
    render(<NotificationPreferencesSection locale="en" state="ready" />);

    const editor = document.querySelector('[data-notification-preferences="ready"]');
    expect(editor).toBeTruthy();
    expect(editor?.querySelector('[data-notification-policy]')).toBeTruthy();
    expect(editor?.querySelectorAll('[data-notification-category-group]')).toHaveLength(3);
    expect(editor?.querySelectorAll('[data-notification-category]')).toHaveLength(7);
    expect(screen.getByText('Reviews & approvals')).toBeTruthy();
    expect(screen.getByLabelText('In-app delivery mode for Account security')).toBeTruthy();
    expect(screen.getByLabelText('Account security minimum urgency')).toBeTruthy();
    expect(screen.getByLabelText('In-app for Account security')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Save notification preferences' })).toBeTruthy();
  });

  it('exposes account actions without claiming unsupported profile or MFA mutations', () => {
    renderSettings(<WorkspaceSettingsPage locale="vi-VN" canManage />);
    expect(screen.getByText('Đổi mật khẩu')).toBeTruthy();
    expect(screen.getByText(/Đăng xuất để kết thúc phiên này/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở đặt lại mật khẩu' }).getAttribute('href')).toBe(
      '/vi-VN/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe('/en/settings');
    expect(screen.getByText('Chưa khả dụng')).toBeTruthy();
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

  it('explains a revision conflict instead of silently reverting a settings change', () => {
    renderSettings(
      <WorkspaceSettingsPage
        locale="en"
        canManage
        mutationError="REVISION_CONFLICT"
        mutationStatus="error"
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'These settings changed elsewhere. The latest version is loaded; try again.',
    );
  });

  it('shows an honest security empty state when no session projection exists', () => {
    render(<SessionList locale="en" sessions={[]} />);
    expect(screen.getByText('No session data yet')).toBeTruthy();
    expect(screen.getByText(/server has not provided a session list yet/u)).toBeTruthy();
  });
});
