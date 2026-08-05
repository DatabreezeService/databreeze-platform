import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesktopApp } from '../src/renderer/app.tsx';

function installLockedBridge() {
  Object.defineProperty(window, 'databreezeDesktop', {
    configurable: true,
    value: {
      v1: {
        session: {
          getSafeState: () =>
            Promise.resolve({
              applicationVersion: '0.0.0',
              dataMode: 'LOCAL',
              deviceState: 'locked',
              enrollmentState: 'not-enrolled',
              locale: 'vi-VN',
            }),
        },
        sidecar: {
          getStatus: () =>
            Promise.resolve({
              engineVersion: null,
              lifecycle: 'not-installed',
              protocolVersion: null,
            }),
        },
      },
    },
  });
}

describe('Desktop product module workbench', () => {
  it('lists all ten approved modules in Vietnamese without exposing file or process controls', () => {
    installLockedBridge();
    render(<DesktopApp />);

    const navigation = screen.getByRole('navigation', { name: 'Mô-đun sản phẩm' });
    const moduleButtons = within(navigation).getAllByRole('tab');

    expect(moduleButtons).toHaveLength(10);
    expect(within(navigation).getByRole('tab', { name: 'Tự động hóa thư mục' })).toBeTruthy();
    expect(within(navigation).getByRole('tab', { name: 'Kiểm toán bảng tính' })).toBeTruthy();
    expect(within(navigation).getByRole('tab', { name: 'Phân tích báo giá' })).toBeTruthy();
    expect(within(navigation).getByRole('tab', { name: 'Ghi nhận vận hành' })).toBeTruthy();
    expect(
      within(navigation).getByRole('tab', { name: 'Phát hiện thất thoát hóa đơn' }),
    ).toBeTruthy();
    expect(within(navigation).getByRole('tab', { name: 'Xưởng báo cáo khách hàng' })).toBeTruthy();
    expect(
      within(navigation).getByRole('tab', { name: 'Nhà phân tích dữ liệu riêng tư' }),
    ).toBeTruthy();
    expect(
      within(navigation).getByRole('tab', { name: 'Sẵn sàng di chuyển dữ liệu' }),
    ).toBeTruthy();
    expect(
      within(navigation).getByRole('tab', { name: 'Giám sát chất lượng dữ liệu' }),
    ).toBeTruthy();
    expect(within(navigation).getByRole('tab', { name: 'Trình nhập dữ liệu nhúng' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /chọn tệp|thư mục|lệnh/u })).toBeNull();
  });

  it('supports keyboard module selection with one roving tab stop', async () => {
    const user = userEvent.setup();
    installLockedBridge();
    render(<DesktopApp />);

    const folderAutopilot = screen.getByRole('tab', { name: 'Tự động hóa thư mục' });
    folderAutopilot.focus();
    await user.keyboard('{ArrowDown}');

    expect(
      screen.getByRole('tab', { name: 'Kiểm toán bảng tính' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'Kiểm toán bảng tính', level: 2 })).toBeTruthy();
    expect(
      screen.getAllByRole('tab').filter((tab) => tab.getAttribute('tabindex') === '0'),
    ).toHaveLength(1);
  });

  it('provides complete English module copy and disables every unwired action', async () => {
    const user = userEvent.setup();
    installLockedBridge();
    render(<DesktopApp />);

    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('tab', { name: 'Private Data Analyst' }));

    expect(screen.getByRole('heading', { name: 'Private Data Analyst', level: 2 })).toBeTruthy();
    expect(
      screen.getByText('Catalog and analyze explicitly authorized local datasets'),
    ).toBeTruthy();
    expect(screen.getByText('Use optional local AI and inspect detailed evidence')).toBeTruthy();
    expect(
      screen.getByText('Save offline analyses and synchronize permitted results'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Start local analysis' }).hasAttribute('disabled'),
    ).toBe(true);
    expect((await screen.findByRole('status')).textContent).toContain('Engine not installed');
    expect(screen.getByText(/No dataset is loaded and no file action will run/u)).toBeTruthy();
  });

  it('shows only bounded safe bridge state in the status rail', async () => {
    installLockedBridge();
    render(<DesktopApp />);

    await waitFor(() => {
      expect(screen.getByText('0.0.0')).toBeTruthy();
    });
    expect(screen.getAllByText('LOCAL')).toHaveLength(2);
    expect(screen.getByText('Chưa đăng ký thiết bị')).toBeTruthy();
    expect(screen.getByText('Engine chưa được cài trong phần nền tảng này')).toBeTruthy();
  });
});
