import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSwitcher } from '../src/features/workspace/workspace-switcher.tsx';

const workspaces = [
  { id: 'workspace-a', name: 'Bright Cloud' },
  { id: 'workspace-b', name: 'Client projects' },
];

describe('workspace chooser [WEB-028]', () => {
  it('opens from the workspace name, marks the current workspace, and switches by callback', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn(async () => ({ accepted: true as const }));
    render(
      <WorkspaceSwitcher
        currentWorkspaceId="workspace-a"
        locale="en"
        onSwitch={onSwitch}
        workspaces={workspaces}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Choose workspace: Bright Cloud' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(
      screen.getByRole('menuitemradio', { name: /Bright Cloud/u }).getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: /Client projects/u }));

    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith('workspace-b'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens a localized create dialog and submits a trimmed workspace name', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => ({ accepted: true as const }));
    render(
      <WorkspaceSwitcher
        currentWorkspaceId="workspace-a"
        locale="vi-VN"
        onCreate={onCreate}
        workspaces={[workspaces[0]!]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chọn không gian làm việc/u }));
    await user.click(screen.getByRole('menuitem', { name: /Tạo không gian làm việc/u }));
    expect(screen.getByRole('dialog', { name: 'Tạo không gian làm việc mới' })).toBeTruthy();

    await user.type(screen.getByLabelText('Tên không gian làm việc'), '  Dữ liệu 2026  ');
    await user.click(screen.getByRole('button', { name: 'Tạo không gian' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Dữ liệu 2026'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
