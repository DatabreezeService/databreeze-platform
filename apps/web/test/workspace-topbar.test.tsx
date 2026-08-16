import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceTopbar } from '../src/components/workspace-topbar.tsx';

const baseProperties = {
  isMobile: false,
  locale: 'en' as const,
  mobileNavigationOpen: false,
  onMobileNavigationOpenChange: () => undefined,
};

function renderTopbar(
  notificationState: NonNullable<ComponentProps<typeof WorkspaceTopbar>['notificationState']>,
) {
  return render(
    <MemoryRouter initialEntries={['/en/dashboards']}>
      <WorkspaceTopbar {...baseProperties} notificationState={notificationState} />
    </MemoryRouter>,
  );
}

describe('workspace topbar notifications', () => {
  it('renders the approved dashboard breadcrumb and active locale controls', () => {
    render(
      <MemoryRouter initialEntries={['/vi-VN/dashboards']}>
        <WorkspaceTopbar
          {...baseProperties}
          dashboardMode
          locale="vi-VN"
          bootstrap={{
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              displayName: 'Mai',
              locale: 'vi-VN',
              mfaState: 'NOT_CONFIGURED',
            },
            organizations: [
              {
                id: '00000000-0000-4000-8000-000000000002',
                name: 'Bright Cloud',
                personal: true,
                status: 'ACTIVE',
                workspaces: [
                  {
                    id: '00000000-0000-4000-8000-000000000003',
                    name: 'Bright Cloud',
                    status: 'ACTIVE',
                    projects: [],
                  },
                ],
              },
            ],
            recentScopes: [],
            session: {
              scopeType: 'workspace',
              organizationId: '00000000-0000-4000-8000-000000000002',
              workspaceId: '00000000-0000-4000-8000-000000000003',
              authorizationEpoch: 1,
            },
            platform: { apiVersion: 'v1' },
          }}
          notificationState={{ status: 'empty', items: [] }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Đường dẫn bảng điều khiển').textContent).toContain(
      'Bright Cloud',
    );
    expect(screen.getByText('Bức tranh kinh doanh')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tiếng Việt/i })).toBeTruthy();
  });

  it('displays only the organization/workspace/project names derived from authenticated bootstrap', () => {
    render(
      <MemoryRouter initialEntries={['/en/data']}>
        <WorkspaceTopbar
          {...baseProperties}
          bootstrap={{
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              displayName: 'Mai',
              locale: 'en',
              mfaState: 'NOT_CONFIGURED',
            },
            organizations: [
              {
                id: '00000000-0000-4000-8000-000000000002',
                name: 'Server organization',
                personal: true,
                status: 'ACTIVE',
                workspaces: [
                  {
                    id: '00000000-0000-4000-8000-000000000003',
                    name: 'Server workspace',
                    status: 'ACTIVE',
                    projects: [
                      {
                        id: '00000000-0000-4000-8000-000000000004',
                        name: 'Server project',
                        kind: 'INTERNAL',
                        status: 'ACTIVE',
                      },
                    ],
                  },
                ],
              },
            ],
            recentScopes: [],
            session: {
              scopeType: 'project',
              organizationId: '00000000-0000-4000-8000-000000000002',
              workspaceId: '00000000-0000-4000-8000-000000000003',
              projectId: '00000000-0000-4000-8000-000000000004',
              authorizationEpoch: 1,
            },
            platform: { apiVersion: 'v1' },
          }}
          notificationState={{ status: 'empty', items: [] }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Server organization')).toBeTruthy();
    expect(screen.getByText('Server workspace')).toBeTruthy();
    expect(screen.getByText('Server project')).toBeTruthy();
    expect(screen.queryByText('Bright Cloud Organization')).toBeNull();
  });

  it('offers an explicit localized sign-out action and reports completion to the shell', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn(async () => undefined);
    render(
      <MemoryRouter initialEntries={['/vi-VN/dashboards']}>
        <WorkspaceTopbar
          {...baseProperties}
          locale="vi-VN"
          notificationState={{ status: 'empty', items: [] }}
          onSignOut={onSignOut}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('has no zero badge and no fake entries when notification state is empty', async () => {
    const user = userEvent.setup();
    renderTopbar({ status: 'empty', items: [] });

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    expect(trigger.textContent).not.toContain('0');
    expect(screen.queryByText(/unread/i)).toBeNull();

    await user.click(trigger);

    expect(screen.getByRole('status').textContent).toContain('No notifications yet.');
    expect(screen.queryByText('Approve the July revenue report')).toBeNull();
    expect(screen.queryByText('Review 12 data exceptions')).toBeNull();
  });

  it('derives the accessible label and badge from the injected unread state', () => {
    renderTopbar({
      status: 'ready',
      items: [
        {
          eventId: 'unread',
          kind: 'REVIEW_REQUIRED',
          label: 'Review required',
          unresolved: true,
          state: 'UNREAD',
        },
        {
          eventId: 'read',
          kind: 'SYNC_FAILED',
          label: 'Sync needs attention',
          unresolved: true,
          state: 'READ',
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('moves focus to the panel and returns it to the trigger on Escape', async () => {
    const user = userEvent.setup();
    renderTopbar({ status: 'loading', items: [] });

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    await user.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });

    await waitFor(() => expect(document.activeElement).toBe(panel));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses dialog semantics, a close control, and dismisses on document Escape or outside click', async () => {
    const user = userEvent.setup();
    renderTopbar({ status: 'ready', items: [] });

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(screen.getByRole('button', { name: 'Close notifications' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy();
    await user.click(document.body);
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close notifications' }));
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    void dialog;
  });
});
