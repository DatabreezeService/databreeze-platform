import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { WorkspaceSettingsRoutePage } from '../src/features/settings/workspace-settings-page.tsx';

describe('workspace settings route [WEB-019]', () => {
  it('renders the real settings surface and truthful API-unavailable state', async () => {
    const router = createAppRouter({ initialEntries: ['/en/administration'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeTruthy();
    expect(screen.queryByText('This area is not available yet')).toBeNull();
    expect(await screen.findByText('Workspace settings could not load.')).toBeTruthy();
  });

  it('shows a complete owner settings workspace in explicit local demo mode', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsRoutePage locale="vi-VN" demoMode />);

    expect(screen.getByText('Mai Quỳnh')).toBeTruthy();
    expect(screen.getByText('Chủ sở hữu')).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' }) as HTMLSelectElement)
        .value,
    ).toBe('APPLY_CONFIRMED_CHANGES');
    expect(screen.queryByText('Không thể tải cài đặt không gian làm việc.')).toBeNull();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' }),
      'ANALYZE',
    );
    expect(
      (screen.getByRole('combobox', { name: 'Quyền trợ lý của Mai Quỳnh' }) as HTMLSelectElement)
        .value,
    ).toBe('ANALYZE');
  });
});
