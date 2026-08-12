import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchTabs } from '../src/renderer/workbench/workbench-tabs.tsx';

describe('Desktop V2 workbench tabs', () => {
  it('opens, activates, closes, and restores tabs as local presentation state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const tabs = [
      { id: 'tab-dataset', kind: 'dataset' as const, title: 'Chi phi Q1' },
      { id: 'tab-receipt', kind: 'receipt' as const, title: 'Hoa don 12' },
    ];

    const { rerender } = render(
      <WorkbenchTabs
        activeTabId="tab-dataset"
        locale="vi-VN"
        onChange={onChange}
        tabs={tabs}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Thẻ bàn làm việc' });
    expect(within(tablist).getByRole('tab', { name: 'Chi phi Q1' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    await user.click(within(tablist).getByRole('tab', { name: 'Hoa don 12' }));
    expect(onChange).toHaveBeenCalledWith({
      type: 'activate',
      tabId: 'tab-receipt',
    });

    await user.click(screen.getByRole('button', { name: 'Đóng Hoa don 12' }));
    expect(onChange).toHaveBeenCalledWith({
      type: 'close',
      tabId: 'tab-receipt',
    });

    rerender(
      <WorkbenchTabs
        activeTabId="tab-dataset"
        locale="en"
        onChange={onChange}
        tabs={[{ id: 'tab-dataset', kind: 'dataset', title: 'Chi phi Q1' }]}
      />,
    );
    expect(screen.getByRole('tablist', { name: 'Workbench tabs' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Hoa don 12' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Restore closed tabs' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'restore' });
  });
});
