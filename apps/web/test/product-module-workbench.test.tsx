import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

function renderShell(pathname: string) {
  const router = createAppRouter({ initialEntries: [pathname] });
  render(<ApplicationBoundary router={router} />);
  return router;
}

describe('product module workbench navigation', () => {
  it('lists all ten approved modules in the Vietnamese product navigation', async () => {
    renderShell('/vi-VN/workspace');

    const navigation = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const productGroup = within(navigation).getByRole('group', { name: 'Mô-đun sản phẩm' });
    const moduleLinks = within(productGroup).getAllByRole('link');

    expect(moduleLinks).toHaveLength(10);
    expect(within(productGroup).getByRole('link', { name: 'Tự động hóa thư mục' })).toBeTruthy();
    expect(within(productGroup).getByRole('link', { name: 'Kiểm toán bảng tính' })).toBeTruthy();
    expect(within(productGroup).getByRole('link', { name: 'Phân tích báo giá' })).toBeTruthy();
    expect(within(productGroup).getByRole('link', { name: 'Ghi nhận vận hành' })).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Phát hiện thất thoát hóa đơn' }),
    ).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Xưởng báo cáo khách hàng' }),
    ).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Nhà phân tích dữ liệu riêng tư' }),
    ).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Sẵn sàng di chuyển dữ liệu' }),
    ).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Giám sát chất lượng dữ liệu' }),
    ).toBeTruthy();
    expect(
      within(productGroup).getByRole('link', { name: 'Trình nhập dữ liệu nhúng' }),
    ).toBeTruthy();
  });

  it('renders an English module workbench with its governed Web responsibilities', async () => {
    renderShell('/en/modules/quote-intelligence');

    expect(
      await screen.findByRole('heading', { name: 'Quote Intelligence', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('Configure RFQs, suppliers, and scoring')).toBeTruthy();
    expect(screen.getByText('Collaborate, approve, and review history')).toBeTruthy();
    expect(screen.getByText('Publish governed comparison reports')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Quote Intelligence' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('states API readiness honestly and prevents unavailable mutations', async () => {
    renderShell('/en/modules/private-data-analyst');

    expect((await screen.findByRole('status')).textContent).toContain('Governed API not connected');
    expect(screen.getByText(/No data has been loaded and no action will be sent/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start analysis' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText('PDA-001–PDA-037')).toBeTruthy();
  });

  it('preserves the selected module when switching to the default Vietnamese locale', async () => {
    const user = userEvent.setup();
    const router = renderShell('/en/modules/data-quality-guard?view=incidents#overview');

    expect(
      await screen.findByRole('heading', { name: 'Data Quality Guard', level: 1 }),
    ).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Tiếng Việt' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vi-VN/modules/data-quality-guard');
      expect(router.state.location.search).toBe('?view=incidents');
      expect(router.state.location.hash).toBe('#overview');
    });
    expect(
      await screen.findByRole('heading', { name: 'Giám sát chất lượng dữ liệu', level: 1 }),
    ).toBeTruthy();
  });
});
