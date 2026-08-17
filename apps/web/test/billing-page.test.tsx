import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BillingReturnPage } from '../src/features/billing/billing-page.tsx';

const paymentOrder = {
  schemaVersion: 4,
  paymentOrderId: '11111111-1111-4111-8111-111111111111',
  orderCode: 123456,
  planId: 'professional-monthly',
  amountVnd: 399000,
  currency: 'VND',
};

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
});
