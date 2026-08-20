import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BillingPage, BillingReturnPage } from '../src/features/billing/billing-page.tsx';

const paymentOrder = {
  schemaVersion: 4,
  paymentOrderId: '11111111-1111-4111-8111-111111111111',
  orderCode: 123456,
  planId: 'professional-monthly',
  amountVnd: 399000,
  currency: 'VND',
};

const catalogFamilies = [
  { family: 'personal', displayNameVi: 'Cá nhân', displayNameEn: 'Personal', amountVnd: 149_000 },
  {
    family: 'professional',
    displayNameVi: 'Chuyên nghiệp',
    displayNameEn: 'Professional',
    amountVnd: 399_000,
  },
  { family: 'team', displayNameVi: 'Nhóm', displayNameEn: 'Team', amountVnd: 999_000 },
] as const;

function serverPlanCatalog() {
  return {
    schemaVersion: 4,
    plans: catalogFamilies.flatMap(({ family, displayNameVi, displayNameEn, amountVnd }) =>
      (['monthly', 'annual'] as const).map((billingCycle) => ({
        id: `${family}-${billingCycle}`,
        family,
        billingCycle,
        amountVnd: billingCycle === 'annual' ? amountVnd * 10 : amountVnd,
        description: `${family} ${billingCycle}`,
        displayNameVi,
        displayNameEn,
        taglineVi: `Gói ${displayNameVi} ${billingCycle}`,
        taglineEn: `${displayNameEn} ${billingCycle} plan`,
        benefitsVi: ['Thư mục đã duyệt', 'Không gian dữ liệu rõ ràng'],
        benefitsEn: ['Approved folders', 'A clear data workspace'],
        allowances: {
          connectedFolders: 'unlimited',
          ocrPagesPerMonth: 200,
          agentCreditsPerMonth: 1_000,
          etlRowsPerMonth: 5_000_000,
          logicalDatasets: 20,
          governedStorageGb: 10,
          agentEnabledMembers: 1,
          viewerMembers: 2,
          workspaces: 1,
          refreshMinutes: 60,
        },
      })),
    ),
  };
}

function stubServerPlanCatalog() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(serverPlanCatalog()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function renderReturn(locale: 'en' | 'vi-VN', status: 'PAID' | 'FAILED') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...paymentOrder, status }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  return render(
    <MemoryRouter
      initialEntries={[
        `/${locale}/billing/${status === 'PAID' ? 'success' : 'failed'}?orderCode=123456`,
      ]}
    >
      <Routes>
        <Route path="/:locale/billing/:result" element={<BillingReturnPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PayOS billing return screens [BUA-006, BUA-009, WEB-011, WEB-013]', () => {
  it('renders a server-confirmed English success state', async () => {
    renderReturn('en', 'PAID');

    expect(await screen.findByRole('heading', { name: 'Payment successful' })).toBeTruthy();
    expect(screen.getByText(/Order 123456 was confirmed by the server/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to plans' })).toBeTruthy();
  });

  it('renders a localized Vietnamese failed state from server status', async () => {
    renderReturn('vi-VN', 'FAILED');

    expect(await screen.findByRole('heading', { name: 'Thanh toán chưa hoàn tất' })).toBeTruthy();
    expect(screen.getByText(/Giao dịch bị hủy, thất bại/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Quay lại chọn gói' })).toBeTruthy();
  });

  it('falls back to local plan catalog when the server catalog is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    render(
      <MemoryRouter initialEntries={['/vi-VN/billing']}>
        <Routes>
          <Route path="/:locale/billing" element={<BillingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cá nhân')).toBeTruthy();
    expect(screen.getByText('Chuyên nghiệp')).toBeTruthy();
    expect(screen.getByText('Nhóm')).toBeTruthy();
  });

  it('shows only the selected Vietnamese billing period and switches plans', async () => {
    const user = userEvent.setup();
    stubServerPlanCatalog();
    const { container } = render(
      <MemoryRouter initialEntries={['/vi-VN/billing?planId=personal-annual']}>
        <Routes>
          <Route path="/:locale/billing" element={<BillingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      (await screen.findByRole('button', { name: /Theo năm/u })).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(container.querySelector('.billing-page--plans')).toBeTruthy();
    expect(container.querySelectorAll('[data-plan-id$="-annual"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-plan-id$="-monthly"]')).toHaveLength(0);
    expect(screen.getByText('1.490.000 ₫')).toBeTruthy();
    expect(screen.getByText('3.990.000 ₫')).toBeTruthy();
    expect(screen.getByText('9.990.000 ₫')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Theo tháng/u }));

    expect(screen.getByRole('button', { name: /Theo tháng/u }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(container.querySelectorAll('[data-plan-id$="-monthly"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-plan-id$="-annual"]')).toHaveLength(0);
  });

  it('localizes the billing period selector and filters English annual plans', async () => {
    const user = userEvent.setup();
    stubServerPlanCatalog();
    const { container } = render(
      <MemoryRouter initialEntries={['/en/billing']}>
        <Routes>
          <Route path="/:locale/billing" element={<BillingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      (await screen.findByRole('button', { name: 'Monthly' })).getAttribute('aria-pressed'),
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: /Annual/u }));

    expect(screen.getByRole('button', { name: /Annual/u }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(container.querySelectorAll('[data-plan-id$="-annual"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-plan-id$="-monthly"]')).toHaveLength(0);
  });
});
