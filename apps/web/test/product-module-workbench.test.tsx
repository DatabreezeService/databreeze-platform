import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { PRODUCT_MODULE_REGISTRY } from '../src/features/product-modules/product-module-registry.ts';

function renderShell(pathname: string) {
  const router = createAppRouter({ initialEntries: [pathname] });
  render(<ApplicationBoundary router={router} />);
  return router;
}

describe('product module workbench navigation', () => {
  it('keeps approved modules reachable without listing them in the primary rail', async () => {
    renderShell('/vi-VN/dashboards');

    const navigation = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(navigation.textContent).toContain('Bảng điều khiển');
    expect(navigation.textContent).toContain('Phân tích');
    expect(navigation.textContent).toContain('Dữ liệu');
    expect(navigation.textContent).not.toContain('Mô-đun sản phẩm');
    expect(PRODUCT_MODULE_REGISTRY).toHaveLength(10);
  });

  it('renders an English module workbench with its governed Web responsibilities', async () => {
    renderShell('/en/modules/quote-intelligence');

    expect(
      await screen.findByRole('heading', { name: 'Quote Intelligence', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('Configure RFQs, suppliers, and scoring')).toBeTruthy();
    expect(screen.getByText('Collaborate, approve, and review history')).toBeTruthy();
    expect(screen.getByText('Publish governed comparison reports')).toBeTruthy();
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
  });
});
