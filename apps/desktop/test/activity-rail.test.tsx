import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityRail } from '../src/renderer/workbench/activity-rail.tsx';

describe('Desktop V2 activity rail', () => {
  it('renders compact Vietnamese activities distinct from Web three-section rail', () => {
    render(
      <ActivityRail
        activity="dashboard"
        collapsed={false}
        locale="vi-VN"
        onActivityChange={() => undefined}
        onCollapsedChange={() => undefined}
      />,
    );

    const rail = screen.getByRole('navigation', { name: 'Hoạt động bàn làm việc' });
    expect(within(rail).getByRole('button', { name: 'Bảng điều khiển' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Phân tích' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Dữ liệu' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Đánh giá' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Cài đặt' })).toBeTruthy();
    expect(within(rail).queryByRole('button', { name: 'Hộp thư đến' })).toBeNull();
  });

  it('supports collapse, keyboard activation, and complete English labels', async () => {
    const user = userEvent.setup();
    const onActivityChange = vi.fn();
    const onCollapsedChange = vi.fn();
    render(
      <ActivityRail
        activity="analysis"
        collapsed={false}
        locale="en"
        onActivityChange={onActivityChange}
        onCollapsedChange={onCollapsedChange}
      />,
    );

    const rail = screen.getByRole('navigation', { name: 'Workbench activities' });
    expect(within(rail).getByRole('button', { name: 'Dashboard' })).toBeTruthy();
    expect(
      within(rail).getByRole('button', { name: 'Analysis' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(within(rail).getByRole('button', { name: 'Data' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Reviews' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Settings' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Collapse activity rail' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);

    await user.click(within(rail).getByRole('button', { name: 'Data' }));
    expect(onActivityChange).toHaveBeenCalledWith('data');
  });

  it('honors reduced motion by avoiding decorative transition class', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
        onchange: null,
      }),
    });

    const { container } = render(
      <ActivityRail
        activity="dashboard"
        collapsed={false}
        locale="en"
        onActivityChange={() => undefined}
        onCollapsedChange={() => undefined}
      />,
    );

    expect(
      container.querySelector('.activity-rail')?.classList.contains('activity-rail--motion'),
    ).toBe(false);
  });
});
