import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import './billing-page.css';

type BillingCycle = 'monthly' | 'annual';

type Plan = {
  readonly id: string;
  readonly amountVnd: number;
  readonly name: string;
  readonly cycle: BillingCycle;
  readonly description: string;
  readonly highlight: string;
  readonly benefits: readonly string[];
  readonly featured?: boolean;
};

/** Display catalog. The server still owns the payable amount for every id. */
const plans: readonly Plan[] = Object.freeze([
  {
    id: 'personal-monthly',
    amountVnd: 149_000,
    name: 'Cá nhân',
    cycle: 'monthly',
    description: 'Bắt đầu quản trị dữ liệu trong không gian riêng.',
    highlight: 'Cho cá nhân',
    benefits: ['Không gian dữ liệu cá nhân', 'Dashboard và phân tích cơ bản', 'Thanh toán an toàn qua PayOS'],
  },
  {
    id: 'personal-annual',
    amountVnd: 1_490_000,
    name: 'Cá nhân',
    cycle: 'annual',
    description: 'Trọn năm sử dụng với một lần thanh toán.',
    highlight: 'Tiết kiệm theo năm',
    benefits: ['Không gian dữ liệu cá nhân', 'Dashboard và phân tích cơ bản', 'Thanh toán an toàn qua PayOS'],
  },
  {
    id: 'professional-monthly',
    amountVnd: 399_000,
    name: 'Chuyên nghiệp',
    cycle: 'monthly',
    description: 'Cho quy trình phân tích và ra quyết định chuyên sâu hơn.',
    highlight: 'Được chọn nhiều',
    featured: true,
    benefits: ['Không gian làm việc nâng cao', 'Dashboard và phân tích chuyên sâu', 'Thanh toán an toàn qua PayOS'],
  },
  {
    id: 'professional-annual',
    amountVnd: 3_990_000,
    name: 'Chuyên nghiệp',
    cycle: 'annual',
    description: 'Tập trung dài hạn cho đội ngũ và quy trình phân tích.',
    highlight: 'Tiết kiệm theo năm',
    benefits: ['Không gian làm việc nâng cao', 'Dashboard và phân tích chuyên sâu', 'Thanh toán an toàn qua PayOS'],
  },
  {
    id: 'team-monthly',
    amountVnd: 999_000,
    name: 'Nhóm',
    cycle: 'monthly',
    description: 'Kết nối các thành viên trong một không gian quản trị chung.',
    highlight: 'Cho đội nhóm',
    benefits: ['Không gian làm việc nhóm', 'Quản lý theo tổ chức', 'Thanh toán an toàn qua PayOS'],
  },
  {
    id: 'team-annual',
    amountVnd: 9_990_000,
    name: 'Nhóm',
    cycle: 'annual',
    description: 'Kế hoạch năm cho không gian làm việc cộng tác.',
    highlight: 'Tiết kiệm theo năm',
    benefits: ['Không gian làm việc nhóm', 'Quản lý theo tổ chức', 'Thanh toán an toàn qua PayOS'],
  },
]);

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function cycleLabel(cycle: BillingCycle): string {
  return cycle === 'annual' ? 'Theo năm' : 'Theo tháng';
}

function cycleSuffix(cycle: BillingCycle): string {
  return cycle === 'annual' ? '/năm' : '/tháng';
}

export function BillingPage() {
  const configuredApi = import.meta.env['VITE_DATABREEZE_API_BASE_URL'] as string | undefined;
  const api = configuredApi?.trim() || globalThis.location.origin;
  const [message, setMessage] = useState<string>();
  const [pendingPlanId, setPendingPlanId] = useState<string>();

  async function checkout(planId: string) {
    setPendingPlanId(planId);
    setMessage(undefined);
    try {
      const response = await fetch(`${api.replace(/\/$/u, '')}/v1/billing/payos/checkout-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      if (!response.ok) {
        setMessage('Không thể tạo liên kết PayOS. Vui lòng thử lại.');
        return;
      }
      const result = (await response.json()) as { readonly checkoutUrl?: unknown };
      if (typeof result.checkoutUrl !== 'string') {
        setMessage('PayOS không trả về liên kết hợp lệ.');
        return;
      }
      window.location.assign(result.checkoutUrl);
    } catch {
      setMessage('Không thể kết nối tới dịch vụ thanh toán.');
    } finally {
      setPendingPlanId(undefined);
    }
  }

  return (
    <section aria-label="Thanh toán DataBreeze" className="billing-page">
      <header className="billing-page__hero">
        <div className="billing-page__hero-copy">
          <p className="billing-page__eyebrow">GÓI DỊCH VỤ DATABREEZE</p>
          <h1>Chọn gói phù hợp với không gian dữ liệu của bạn</h1>
          <p className="billing-page__intro">
            Bắt đầu từ nhu cầu hiện tại và nâng cấp khi quy trình phân tích phát triển. Giá thanh toán được xác định ở server theo mã gói.
          </p>
        </div>
        <div className="billing-page__trust" aria-label="Thông tin thanh toán">
          <span className="billing-page__trust-icon" aria-hidden="true">✓</span>
          <span><strong>Thanh toán an toàn</strong><small>Được xử lý qua PayOS</small></span>
        </div>
      </header>

      {message ? <p className="billing-page__status" role="alert">{message}</p> : null}

      <div className="billing-page__section-heading">
        <div>
          <h2>Các lựa chọn dành cho bạn</h2>
          <p>Chọn chu kỳ thanh toán phù hợp. Bạn sẽ được chuyển tới PayOS để hoàn tất.</p>
        </div>
        <span className="billing-page__server-badge">Giá từ máy chủ</span>
      </div>

      <div className="billing-page__grid">
        {plans.map((plan) => (
          <article className={`billing-plan-card${plan.featured ? ' billing-plan-card--featured' : ''}`} key={plan.id}>
            {plan.featured ? <div className="billing-plan-card__ribbon">Đề xuất</div> : null}
            <div className="billing-plan-card__topline">
              <span className="billing-plan-card__name">{plan.name}</span>
              <span className="billing-plan-card__cycle">{cycleLabel(plan.cycle)}</span>
            </div>
            <p className="billing-plan-card__highlight">{plan.highlight}</p>
            <div className="billing-plan-card__price">
              <strong>{money(plan.amountVnd)}</strong>
              <span>{cycleSuffix(plan.cycle)}</span>
            </div>
            <p className="billing-plan-card__description">{plan.description}</p>
            <ul className="billing-plan-card__benefits">
              {plan.benefits.map((benefit) => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}
            </ul>
            <button
              className="billing-plan-card__button"
              disabled={pendingPlanId !== undefined}
              onClick={() => void checkout(plan.id)}
              type="button"
            >
              {pendingPlanId === plan.id ? 'Đang tạo liên kết…' : 'Chọn gói này'}
            </button>
          </article>
        ))}
      </div>
      <p className="billing-page__footnote">Bạn có thể xem lại trạng thái giao dịch sau khi PayOS chuyển về DataBreeze.</p>
    </section>
  );
}

export function BillingReturnPage() {
  const { pathname } = useLocation();
  const { locale = 'vi-VN' } = useParams();
  const success = pathname.endsWith('/success');
  useEffect(() => { window.history.replaceState({}, '', pathname); }, [pathname]);
  return (
    <section aria-live="polite" className={`billing-return${success ? ' billing-return--success' : ''}`}>
      <div className="billing-return__icon" aria-hidden="true">{success ? '✓' : '!'}</div>
      <p className="billing-page__eyebrow">{success ? 'PAYOS ĐÃ PHẢN HỒI' : 'GIAO DỊCH CHƯA HOÀN TẤT'}</p>
      <h1>{success ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất'}</h1>
      <p>{success ? 'PayOS đã trả về kết quả thành công. Hệ thống sẽ xác nhận trạng thái qua webhook.' : 'Giao dịch bị hủy hoặc chưa thành công. Bạn có thể thử lại.'}</p>
      <div className="billing-return__actions">
        <Link className="billing-return__primary" to={`/${locale}/billing`}>Quay lại chọn gói</Link>
        <Link className="billing-return__secondary" to={`/${locale}/dashboards`}>Về dashboard</Link>
      </div>
    </section>
  );
}
