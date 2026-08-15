import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BillingApiError, createBillingApi } from './billing-api.ts';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

/** Local QA checkout. It is rendered only in the demo build and never accepts a client amount. */
export function BillingMockCheckoutPage() {
  const { locale = 'vi-VN', orderCode: rawOrderCode } = useParams();
  const orderCode = Number(rawOrderCode);
  const navigate = useNavigate();
  const api = useMemo(() => createBillingApi(), []);
  const [amountVnd, setAmountVnd] = useState<number>();
  const [planId, setPlanId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isSafeInteger(orderCode) || orderCode < 1) {
      setMessage('Mã đơn không hợp lệ.');
      return;
    }
    void api.getStatus(orderCode).then((status) => {
      setAmountVnd(status.amountVnd);
      setPlanId(status.planId);
    }).catch((error: unknown) => {
      setMessage(error instanceof BillingApiError ? error.code : 'Không thể tải đơn thanh toán.');
    });
  }, [api, orderCode]);

  async function settle(status: 'PAID' | 'CANCELLED') {
    setBusy(true);
    setMessage(undefined);
    try {
      await api.simulateMockWebhook(orderCode, status);
      navigate(`/${locale}/billing/${status === 'PAID' ? 'success' : 'failed'}?orderCode=${encodeURIComponent(String(orderCode))}`, { replace: true });
    } catch (error: unknown) {
      setMessage(error instanceof BillingApiError ? error.code : 'Không thể cập nhật thanh toán mock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="PayOS mock checkout" className="billing-return">
      <p className="billing-page__eyebrow">PAYOS LOCAL MOCK</p>
      <h1>Xác nhận thanh toán thử</h1>
      <p>Đây là màn hình QA cục bộ. Số tiền và gói được đọc từ đơn hàng trên server.</p>
      {message ? <p className="billing-page__status" role="alert">{message}</p> : null}
      <p><strong>Đơn:</strong> {Number.isSafeInteger(orderCode) ? orderCode : '—'}</p>
      <p><strong>Gói:</strong> {planId ?? 'Đang tải…'}</p>
      <p><strong>Số tiền:</strong> {amountVnd === undefined ? 'Đang tải…' : money(amountVnd)}</p>
      <div className="billing-return__actions">
        <button className="billing-return__primary" disabled={busy || amountVnd === undefined} onClick={() => void settle('PAID')} type="button">
          Thanh toán thành công
        </button>
        <button className="billing-return__secondary" disabled={busy || amountVnd === undefined} onClick={() => void settle('CANCELLED')} type="button">
          Hủy thanh toán
        </button>
      </div>
    </section>
  );
}
