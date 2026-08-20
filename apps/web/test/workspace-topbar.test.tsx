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

const avatarBootstrap = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Mai',
    locale: 'en',
    mfaState: 'NOT_CONFIGURED',
  },
  organizations: [],
  recentScopes: [],
  session: {
    scopeType: 'organization',
    organizationId: '00000000-0000-4000-8000-000000000002',
    authorizationEpoch: 1,
  },
  platform: { apiVersion: 'v1' },
} satisfies NonNullable<ComponentProps<typeof WorkspaceTopbar>['bootstrap']>;

function renderAvatarTopbar(locale: 'en' | 'vi-VN' = 'en') {
  return render(
    <MemoryRouter initialEntries={[`/${locale}/dashboards`]}>
      <WorkspaceTopbar
        {...baseProperties}
        bootstrap={avatarBootstrap}
        locale={locale}
        notificationState={{ status: 'empty', items: [] }}
      />
    </MemoryRouter>,
  );
}

function entitlementSummaryResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 4,
    snapshot: {
      schemaVersion: 1,
      snapshotId: '00000000-0000-4000-8000-000000000010',
      organizationId: '00000000-0000-4000-8000-000000000002',
      planCode: 'development',
      status: 'ACTIVE',
      revision: 1,
      securityEpoch: 1,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      features: [],
      quotas: [{ metric: 'job_count', limit: 100 }],
    },
    aiCredits: { metric: 'job_count', limit: 100, used: 12, reserved: 3, remaining: 85 },
    ...overrides,
  };
}

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
  it('renders the unified topbar with workspace switcher and opens the settings dialog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/vi-VN/dashboards']}>
        <WorkspaceTopbar
          {...baseProperties}
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

    expect(screen.getByText('Bright Cloud')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tiếng Việt/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));
    const settingsAction = screen.getByRole('menuitem', {
      name: 'Hồ sơ & Cài đặt',
    });
    expect(settingsAction.tagName).toBe('BUTTON');
    await user.click(settingsAction);

    const settingsDialog = screen.getByRole('dialog', { name: 'Cài đặt không gian làm việc' });
    expect(settingsDialog.getAttribute('aria-modal')).toBe('true');
    expect(settingsDialog.className).toContain('workspace-settings-dialog');
    expect(settingsDialog.getAttribute('aria-label')).toBe('Cài đặt không gian làm việc');
    expect(settingsDialog.querySelector('.workspace-settings-dialog__header')).toBeNull();
    expect(settingsDialog.textContent).not.toContain(
      'Chọn một chủ đề để xem và cập nhật các tùy chọn được hỗ trợ.',
    );
    expect(settingsDialog.querySelector('[data-settings-dialog-panel="true"]')).toBeTruthy();
    const closeButton = screen.getByRole('button', { name: 'Đóng cài đặt' });
    expect(closeButton).toBeTruthy();
    expect(closeButton.getAttribute('data-settings-dialog-close')).toBe('true');
    expect(settingsDialog.querySelector('.workspace-settings-dialog__controls')).toBeNull();
    expect(settingsDialog.querySelector('[data-settings-dialog-content="true"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('tablist', { name: 'Chủ đề quản trị' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Tài khoản/u })).toBeTruthy();
    expect(document.querySelector('[data-settings-compact-row="change-password"]')).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Cài đặt không gian làm việc' })).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu người dùng' }));
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

    expect(screen.getByText('Server workspace')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Server workspace/u })).toBeTruthy();
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
          bootstrap={{
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              displayName: 'Mai',
              locale: 'vi-VN',
              mfaState: 'NOT_CONFIGURED',
            },
            organizations: [],
            recentScopes: [],
            session: {
              scopeType: 'organization',
              organizationId: '00000000-0000-4000-8000-000000000002',
              authorizationEpoch: 1,
            },
            platform: { apiVersion: 'v1' },
          }}
          notificationState={{ status: 'empty', items: [] }}
          onSignOut={onSignOut}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
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

  it('loads server-authoritative AI credit usage below the upgrade action', async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(responsePromise);
    renderAvatarTopbar();

    await user.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByRole('status').textContent).toContain('Loading AI credit usage');

    resolveResponse(
      new Response(JSON.stringify(entitlementSummaryResponse()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await waitFor(() => expect(screen.getByRole('group', { name: 'AI credits' })).toBeTruthy());
    const creditSection = screen.getByRole('group', { name: 'AI credits' });
    expect(creditSection.textContent).toContain('85');
    expect(creditSection.textContent).toContain('12 used');
    expect(creditSection.textContent).toContain('3 reserved');
    expect(creditSection.textContent).toContain('100 total limit');
    expect(
      screen
        .getByRole('menuitem', { name: 'Upgrade plan' })
        .compareDocumentPosition(creditSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/entitlements/summary'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('keeps unavailable entitlement data truthful and localized', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENTITLEMENT_UNAVAILABLE'));
    renderAvatarTopbar('vi-VN');

    await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Mức sử dụng AI hiện chưa khả dụng.'),
    );
    expect(screen.queryByText('1.000')).toBeNull();
  });

  it('renders the server-provided zero allowance for a Free response without inventing credits', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          entitlementSummaryResponse({
            snapshot: {
              ...entitlementSummaryResponse().snapshot,
              planCode: 'free',
              quotas: [],
            },
            aiCredits: { metric: 'job_count', limit: 0, used: 0, reserved: 0, remaining: 0 },
          }),
        ),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );
    renderAvatarTopbar();

    await user.click(screen.getByRole('button', { name: 'User menu' }));

    await waitFor(() => expect(screen.getByRole('group', { name: 'AI credits' })).toBeTruthy());
    const creditSection = screen.getByRole('group', { name: 'AI credits' });
    expect(creditSection.textContent).toContain('0 total limit');
    expect(
      creditSection.querySelector('.workspace-topbar__avatar-credits-remaining strong')
        ?.textContent,
    ).toBe('0');
  });
});
