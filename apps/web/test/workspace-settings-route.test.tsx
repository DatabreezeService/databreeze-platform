import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { WorkspaceSettingsRoutePage } from '../src/features/settings/workspace-settings-page.tsx';

function selectedValue(element: HTMLElement): string {
  if (!(element instanceof HTMLSelectElement)) throw new Error('EXPECTED_SELECT');
  return element.value;
}

describe('workspace settings route [WEB-019]', () => {
  it('renders the real settings surface and truthful API-unavailable state', async () => {
    const router = createAppRouter({ initialEntries: ['/en/administration'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeTruthy();
    expect(screen.queryByText('This area is not available yet')).toBeNull();
    expect(await screen.findByText('Workspace settings could not load.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View AI credits' }).getAttribute('href')).toBe(
      '/en/usage',
    );
    expect(screen.getByRole('link', { name: 'Plans & billing' }).getAttribute('href')).toBe(
      '/en/billing',
    );
  });

  it('also serves the user-facing settings alias', async () => {
    const router = createAppRouter({ initialEntries: ['/en/settings'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeTruthy();
    expect(await screen.findByText('Workspace settings could not load.')).toBeTruthy();
  });

  it('shows a complete owner settings workspace in explicit local demo mode', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WorkspaceSettingsRoutePage locale="vi-VN" demoMode />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('tab', { name: /Thành viên và quyền/u }));
    expect(screen.getByText('Mai Quỳnh')).toBeTruthy();
    expect(screen.getByText('Chủ sở hữu')).toBeTruthy();
    expect(
      selectedValue(screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' })),
    ).toBe('APPLY_CONFIRMED_CHANGES');
    expect(screen.queryByText('Không thể tải cài đặt không gian làm việc.')).toBeNull();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' }),
      'ANALYZE',
    );
    expect(
      selectedValue(screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' })),
    ).toBe('ANALYZE');
  });
});
