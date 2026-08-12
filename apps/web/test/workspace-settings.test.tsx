import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceSettingsPage } from '../src/features/settings/workspace-settings-page.tsx';
import { MemberAccessTable } from '../src/features/settings/member-access-table.tsx';
import { SessionList } from '../src/features/settings/session-list.tsx';

describe('workspace settings', () => {
  it('denies Viewer mutations and shows English settings chrome', () => {
    render(<WorkspaceSettingsPage locale="en" canManage={false} />);
    expect(screen.getByRole('status').textContent).toContain('Viewer cannot change settings');
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
              agentGrant: 'MANAGE',
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
    expect(screen.getByRole('table', { name: 'Bảng quyền thành viên' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Danh sách phiên' })).toBeTruthy();
  });
});
