import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BillingApiError, createBillingApi } from './billing-api.ts';

function money(value: number, english: boolean): string {
  return `${new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value)} ₫`;
}

/** Local QA checkout. It is rendered only in the local payment profile and never accepts a client amount. */
export function BillingMockCheckoutPage() {
  const { locale = 'vi-VN', orderCode: rawOrderCode } = useParams();
  const english = locale === 'en';
  const orderCode = Number(rawOrderCode);
  const navigate = useNavigate();
  const api = useMemo(() => createBillingApi(), []);
  const [amountVnd, setAmountVnd] = useState<number>();
  const [planId, setPlanId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isSafeInteger(orderCode) || orderCode < 1) {
      setMessage(english ? 'This order code is invalid.' : 'Mã đơn không hợp lệ.');
      return;
    }
    void api
      .getStatus(orderCode)
      .then((status) => {
        setAmountVnd(status.amountVnd);
        setPlanId(status.planId);
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof BillingApiError
            ? error.code
            : english
              ? 'The order could not be loaded.'
              : 'Không thể tải đơn thanh toán.',
        );
      });
  }, [api, english, orderCode]);

  async function settle(status: 'PAID' | 'CANCELLED') {
    setBusy(true);
    setMessage(undefined);
    try {
      await api.simulateMockWebhook(orderCode, status);
      void navigate(
        `/${locale}/billing/${status === 'PAID' ? 'success' : 'failed'}?orderCode=${encodeURIComponent(String(orderCode))}`,
        { replace: true },
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof BillingApiError
          ? error.code
          : english
            ? 'The local payment could not be updated.'
            : 'Không thể cập nhật thanh toán mock.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={english ? 'PayOS local mock checkout' : 'PayOS mock checkout'}
      className="billing-return"
    >
      <p className="billing-page__eyebrow">PAYOS LOCAL MOCK</p>
      <h1>{english ? 'Confirm test payment' : 'Xác nhận thanh toán thử'}</h1>
      <p>
        {english
          ? 'This is a local QA checkout. The amount and plan come from the server order.'
          : 'Đây là màn hình QA cục bộ. Số tiền và gói được đọc từ đơn hàng trên server.'}
      </p>
      {message ? (
        <p className="billing-page__status" role="alert">
          {message}
        </p>
      ) : null}
      <p>
        <strong>{english ? 'Order:' : 'Đơn:'}</strong>{' '}
        {Number.isSafeInteger(orderCode) ? orderCode : '—'}
      </p>
      <p>
        <strong>{english ? 'Plan:' : 'Gói:'}</strong>{' '}
        {planId ?? (english ? 'Loading…' : 'Đang tải…')}
      </p>
      <p>
        <strong>{english ? 'Amount:' : 'Số tiền:'}</strong>{' '}
        {amountVnd === undefined ? (english ? 'Loading…' : 'Đang tải…') : money(amountVnd, english)}
      </p>
      <div className="billing-return__actions">
        <button
          className="billing-return__primary"
          disabled={busy || amountVnd === undefined}
          onClick={() => void settle('PAID')}
          type="button"
        >
          {english ? 'Complete payment' : 'Thanh toán thành công'}
        </button>
        <button
          className="billing-return__secondary"
          disabled={busy || amountVnd === undefined}
          onClick={() => void settle('CANCELLED')}
          type="button"
        >
          {english ? 'Cancel payment' : 'Hủy thanh toán'}
        </button>
      </div>
    </section>
  );
}
