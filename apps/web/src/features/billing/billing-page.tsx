import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { BillingApiError, createBillingApi, type BillingPlan } from './billing-api.ts';
import './billing-page.css';

type BillingCycle = 'monthly' | 'annual';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function cycleLabel(cycle: BillingCycle, english: boolean): string {
  return english ? (cycle === 'annual' ? 'Annual' : 'Monthly') : (cycle === 'annual' ? 'Theo năm' : 'Theo tháng');
}

function cycleSuffix(cycle: BillingCycle, english: boolean): string {
  return english ? (cycle === 'annual' ? '/year' : '/month') : (cycle === 'annual' ? '/năm' : '/tháng');
}

function allowanceLabel(plan: BillingPlan, english: boolean): readonly string[] {
  const a = plan.allowances;
  const number = (value: number) => new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value);
  return english
    ? [`${a.connectedFolders} approved folders`, `${number(a.logicalDatasets)} datasets · ${number(a.governedStorageGb)} GB storage`, `${number(a.workspaces)} workspace${a.workspaces === 1 ? '' : 's'} · ${number(a.viewerMembers)} Viewer members`, `Refresh every ${number(a.refreshMinutes)} min`]
    : [`${a.connectedFolders === 'unlimited' ? 'Không giới hạn' : a.connectedFolders} thư mục đã duyệt`, `${number(a.logicalDatasets)} tập dữ liệu · ${number(a.governedStorageGb)} GB lưu trữ`, `${number(a.workspaces)} workspace · ${number(a.viewerMembers)} thành viên Viewer`, `Làm mới mỗi ${number(a.refreshMinutes)} phút`];
}

export function BillingPage() {
  const api = useMemo(() => createBillingApi(), []);
  const { locale = 'vi-VN' } = useParams();
  const english = locale === 'en';
  const [plans, setPlans] = useState<readonly BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [pendingPlanId, setPendingPlanId] = useState<string>();

  useEffect(() => {
    let active = true;
    void api.listPlans().then((next) => {
      if (active) setPlans(next);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof BillingApiError && (error.code === 'PAYOS_UNAUTHORIZED' || error.code === 'UNAUTHORIZED' || error.code === 'AUTHENTICATION_FAILED' || error.code === 'AUTHENTICATION_UNAVAILABLE')) {
        setMessage(english ? 'This account cannot manage billing. Please use an organization Owner account.' : 'Tài khoản hiện tại chưa có quyền quản lý gói. Hãy dùng tài khoản Owner của tổ chức.');
      } else if (error instanceof BillingApiError && (error.code === 'BILLING_RESPONSE_INVALID')) {
        setMessage(english ? 'The server catalog does not match the current billing contract.' : 'Danh mục gói từ máy chủ không đúng contract hiện tại.');
      } else {
        setMessage(english ? 'Could not load plans from the server. Please try again.' : 'Không thể tải danh mục gói từ máy chủ. Vui lòng thử lại.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api]);

  async function checkout(planId: BillingPlan['id']) {
    setPendingPlanId(planId);
    setMessage(undefined);
    try {
      const session = await api.createCheckout(planId);
      if (typeof session.checkoutUrl !== 'string' || !session.checkoutUrl.startsWith('https://')) {
        setMessage(english ? 'PayOS did not return a valid checkout link.' : 'PayOS không trả về liên kết hợp lệ.');
        return;
      }
      window.location.assign(session.checkoutUrl);
    } catch (error: unknown) {
      if (error instanceof BillingApiError && (error.code === 'PAYOS_UNAUTHORIZED' || error.code === 'AUTHENTICATION_FAILED')) {
        setMessage(english ? 'Only an organization Owner can start checkout.' : 'Chỉ Owner của tổ chức mới có thể bắt đầu thanh toán.');
      } else {
        setMessage(english ? 'Could not create the PayOS checkout link. Please try again.' : 'Không thể tạo liên kết PayOS. Vui lòng thử lại.');
      }
    } finally {
      setPendingPlanId(undefined);
    }
  }

  return (
    <section aria-label="Thanh toán DataBreeze" className="billing-page">
      <header className="billing-page__hero">
        <div className="billing-page__hero-copy">
          <p className="billing-page__eyebrow">{english ? 'DATABREEZE PLANS' : 'GÓI DỊCH VỤ DATABREEZE'}</p>
          <h1>{english ? 'Choose the right plan for your data workspace' : 'Chọn gói phù hợp với không gian dữ liệu của bạn'}</h1>
          <p className="billing-page__intro">{english ? 'Prices and allowances come from the server catalog and are locked when the order is created. You will be redirected to PayOS to complete payment.' : 'Giá và giới hạn được tải từ danh mục server và được khóa lại khi tạo đơn. Bạn sẽ được chuyển tới PayOS để hoàn tất thanh toán.'}</p>
        </div>
        <div className="billing-page__trust" aria-label="Thông tin thanh toán">
          <span className="billing-page__trust-icon" aria-hidden="true">✓</span>
          <span><strong>{english ? 'Secure checkout' : 'Thanh toán an toàn'}</strong><small>{english ? 'Processed by PayOS' : 'Được xử lý qua PayOS'}</small></span>
        </div>
      </header>

      {message ? <p className="billing-page__status" role="alert">{message}</p> : null}

      <div className="billing-page__section-heading">
        <div><h2>{english ? 'Plans for your workspace' : 'Các lựa chọn dành cho bạn'}</h2><p>{english ? 'Prices shown are confirmed by the server.' : 'Giá hiển thị là giá server đã xác nhận.'}</p></div>
        <span className="billing-page__server-badge">{english ? 'Server catalog' : 'Giá từ máy chủ'}</span>
      </div>

      {loading ? <p className="billing-page__loading">{english ? 'Loading plans…' : 'Đang tải danh mục gói…'}</p> : (
        <div className="billing-page__grid">
          {plans.map((plan) => {
            const cycle = plan.billingCycle as BillingCycle;
            const name = english ? plan.displayNameEn : plan.displayNameVi;
            const tagline = english ? plan.taglineEn : plan.taglineVi;
            const benefits = english ? plan.benefitsEn : plan.benefitsVi;
            const featured = plan.family === 'professional' && cycle === 'monthly';
            return (
              <article className={`billing-plan-card${featured ? ' billing-plan-card--featured' : ''}`} key={plan.id}>
                {featured ? <div className="billing-plan-card__ribbon">{english ? 'Recommended' : 'Đề xuất'}</div> : null}
                <div className="billing-plan-card__topline"><span className="billing-plan-card__name">{name}</span><span className="billing-plan-card__cycle">{cycleLabel(cycle, english)}</span></div>
                <p className="billing-plan-card__highlight">{tagline}</p>
                <div className="billing-plan-card__price"><strong>{money(plan.amountVnd)}</strong><span>{cycleSuffix(cycle, english)}</span></div>
                <p className="billing-plan-card__description">{plan.description}</p>
                <ul className="billing-plan-card__benefits">{benefits.map((benefit) => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
                <ul className="billing-plan-card__allowances" aria-label={english ? 'Plan allowances' : 'Giới hạn gói'}>{allowanceLabel(plan, english).map((allowance) => <li key={allowance}>{allowance}</li>)}</ul>
                <button className="billing-plan-card__button" disabled={pendingPlanId !== undefined} onClick={() => void checkout(plan.id)} type="button">
                  {pendingPlanId === plan.id ? (english ? 'Creating checkout…' : 'Đang tạo liên kết…') : (english ? 'Choose this plan' : 'Chọn gói này')}
                </button>
              </article>
            );
          })}
        </div>
      )}
      <p className="billing-page__footnote">{english ? 'After returning, DataBreeze confirms payment through the API and webhook rather than trusting redirect query parameters.' : 'Sau khi quay về, DataBreeze sẽ xác nhận trạng thái bằng API và webhook, không dựa trên query redirect.'}</p>
    </section>
  );
}

type ReturnState = 'loading' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'error';

export function BillingReturnPage() {
  const { search } = useLocation();
  const { locale = 'vi-VN' } = useParams();
  const api = useMemo(() => createBillingApi(), []);
  const [state, setState] = useState<ReturnState>('loading');
  const [orderCode, setOrderCode] = useState<number>();

  useEffect(() => {
    const parsed = Number(new URLSearchParams(search).get('orderCode'));
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      setState('error');
      return;
    }
    setOrderCode(parsed);
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api.getStatus(parsed);
        if (!active) return;
        setState(result.status.toLowerCase() as ReturnState);
        if (result.status === 'PENDING' && attempts < 40) {
          attempts += 1;
          timer = setTimeout(() => void poll(), 1500);
        }
      } catch {
        if (active) setState('error');
      }
    };
    void poll();
    return () => { active = false; if (timer !== undefined) clearTimeout(timer); };
  }, [api, search]);

  const paid = state === 'paid';
  const failed = state === 'failed' || state === 'cancelled' || state === 'error';
  const heading = paid ? 'Thanh toán thành công' : state === 'pending' || state === 'loading' ? 'Đang xác nhận thanh toán' : 'Thanh toán chưa hoàn tất';
  const detail = paid
    ? `Đơn ${orderCode ?? ''} đã được server xác nhận và quyền sử dụng đã cập nhật.`
    : state === 'pending' || state === 'loading'
      ? 'Đang chờ webhook PayOS. Trang sẽ tự cập nhật khi có kết quả.'
      : 'Giao dịch bị hủy, thất bại hoặc không còn thuộc phiên đăng nhập hiện tại.';

  return (
    <section aria-live="polite" className={`billing-return${paid ? ' billing-return--success' : ''}`}>
      <div className="billing-return__icon" aria-hidden="true">{paid ? '✓' : failed ? '!' : '…'}</div>
      <p className="billing-page__eyebrow">{paid ? 'PAYOS Đ\u00c3 XÁC NHẬN' : 'PAYOS ĐANG ĐƯỢC KIỂM TRA'}</p>
      <h1>{heading}</h1>
      <p>{detail}</p>
      <div className="billing-return__actions">
        <Link className="billing-return__primary" to={`/${locale}/billing`}>Quay lại chọn gói</Link>
        <Link className="billing-return__secondary" to={`/${locale}/dashboards`}>Về dashboard</Link>
      </div>
    </section>
  );
}
