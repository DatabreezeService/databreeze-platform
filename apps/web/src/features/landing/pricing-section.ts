type LandingLocale = 'en' | 'vi-VN';

interface LandingPricingPlan {
  readonly annualAmountVnd: number;
  readonly family: 'personal' | 'professional' | 'team';
  readonly monthlyAmountVnd: number;
  readonly copy: Readonly<
    Record<
      LandingLocale,
      {
        readonly cta: string;
        readonly features: readonly string[];
        readonly name: string;
        readonly tagline: string;
      }
    >
  >;
}

/**
 * BUA-002/003 presentation mirror of the immutable catalog on origin/PayOS.
 * These values describe the public offer only; they never authorize usage or payment.
 */
const LANDING_PRICING_PLANS = Object.freeze([
  Object.freeze({
    family: 'personal',
    monthlyAmountVnd: 149_000,
    annualAmountVnd: 1_490_000,
    copy: Object.freeze({
      'vi-VN': Object.freeze({
        name: 'Cá nhân',
        tagline: 'Cho cửa hàng nhỏ và người vận hành độc lập',
        cta: 'Bắt đầu với Cá nhân',
        features: Object.freeze([
          '20 tập dữ liệu · 10 GB lưu trữ',
          '1 workspace · 2 thành viên Viewer',
          '1.000 lượt Agent · 200 trang OCR mỗi tháng',
          'Làm mới dữ liệu mỗi 60 phút',
        ]),
      }),
      en: Object.freeze({
        name: 'Personal',
        tagline: 'For individual operators and small stores',
        cta: 'Start with Personal',
        features: Object.freeze([
          '20 datasets · 10 GB storage',
          '1 workspace · 2 Viewer members',
          '1,000 Agent credits · 200 OCR pages monthly',
          'Data refresh every 60 minutes',
        ]),
      }),
    }),
  }),
  Object.freeze({
    family: 'professional',
    monthlyAmountVnd: 399_000,
    annualAmountVnd: 3_990_000,
    copy: Object.freeze({
      'vi-VN': Object.freeze({
        name: 'Chuyên nghiệp',
        tagline: 'Cho nhóm vận hành cần kiểm soát dữ liệu',
        cta: 'Chọn Chuyên nghiệp',
        features: Object.freeze([
          '100 tập dữ liệu · 50 GB lưu trữ',
          '3 workspace · 10 thành viên Viewer',
          '4.000 lượt Agent · 500 trang OCR mỗi tháng',
          'Làm mới dữ liệu mỗi 15 phút',
        ]),
      }),
      en: Object.freeze({
        name: 'Professional',
        tagline: 'For operating teams that need stronger control',
        cta: 'Choose Professional',
        features: Object.freeze([
          '100 datasets · 50 GB storage',
          '3 workspaces · 10 Viewer members',
          '4,000 Agent credits · 500 OCR pages monthly',
          'Data refresh every 15 minutes',
        ]),
      }),
    }),
  }),
  Object.freeze({
    family: 'team',
    monthlyAmountVnd: 999_000,
    annualAmountVnd: 9_990_000,
    copy: Object.freeze({
      'vi-VN': Object.freeze({
        name: 'Nhóm',
        tagline: 'Cho tổ chức đang phát triển',
        cta: 'Bắt đầu cùng Nhóm',
        features: Object.freeze([
          '500 tập dữ liệu · 250 GB lưu trữ',
          '10 workspace · 50 thành viên Viewer',
          '12.000 lượt Agent · 1.500 trang OCR mỗi tháng',
          'Làm mới dữ liệu mỗi 5 phút',
        ]),
      }),
      en: Object.freeze({
        name: 'Team',
        tagline: 'For growing organizations',
        cta: 'Start with Team',
        features: Object.freeze([
          '500 datasets · 250 GB storage',
          '10 workspaces · 50 Viewer members',
          '12,000 Agent credits · 1,500 OCR pages monthly',
          'Data refresh every 5 minutes',
        ]),
      }),
    }),
  }),
] satisfies readonly LandingPricingPlan[]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatVnd(value: number, locale: LandingLocale): string {
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(value)} ₫`;
}

function renderPlan(plan: LandingPricingPlan, locale: LandingLocale, registerHref: string): string {
  const copy = plan.copy[locale];
  const featured = plan.family === 'professional';
  const monthlyDetail =
    locale === 'en' ? 'Flexible monthly billing.' : 'Thanh toán theo tháng, linh hoạt thay đổi.';
  const annualMonthlyEquivalent = Math.round(plan.annualAmountVnd / 12);
  const annualDetail =
    locale === 'en'
      ? `Equivalent to ${formatVnd(annualMonthlyEquivalent, locale)}/month.`
      : `Tương đương ${formatVnd(annualMonthlyEquivalent, locale)}/tháng.`;

  return `<article class="pricing-card${featured ? ' pricing-card-featured' : ''}">
    <div class="pricing-card-topline">
      <span class="pricing-plan-name">${escapeHtml(copy.name)}</span>
      ${featured ? `<span class="pricing-popular">${locale === 'en' ? 'Most popular' : 'Được chọn nhiều nhất'}</span>` : ''}
    </div>
    <p class="pricing-tagline">${escapeHtml(copy.tagline)}</p>
    <div class="pricing-price-row">
      <strong data-pricing-amount data-monthly="${plan.monthlyAmountVnd}" data-annual="${plan.annualAmountVnd}">${formatVnd(plan.monthlyAmountVnd, locale)}</strong>
      <span data-pricing-suffix data-monthly-suffix="${locale === 'en' ? '/month' : '/tháng'}" data-annual-suffix="${locale === 'en' ? '/year' : '/năm'}">${locale === 'en' ? '/month' : '/tháng'}</span>
    </div>
    <p class="pricing-billing-detail" data-pricing-detail data-monthly-detail="${escapeHtml(monthlyDetail)}" data-annual-detail="${escapeHtml(annualDetail)}">${escapeHtml(monthlyDetail)}</p>
    <div class="pricing-card-divider" aria-hidden="true"></div>
    <p class="pricing-included">${locale === 'en' ? 'Everything you need to work clearly' : 'Đủ để làm việc rõ ràng mỗi ngày'}</p>
    <ul class="pricing-feature-list">
      <li><span aria-hidden="true">✓</span>${locale === 'en' ? 'Unlimited approved Windows folders' : 'Thư mục Windows đã duyệt không giới hạn'}</li>
      ${copy.features.map((feature) => `<li><span aria-hidden="true">✓</span>${escapeHtml(feature)}</li>`).join('')}
    </ul>
    <a class="pricing-card-cta${featured ? ' pricing-card-cta-primary' : ''}" href="${escapeHtml(registerHref)}">
      <span>${escapeHtml(copy.cta)}</span><span aria-hidden="true">↗</span>
    </a>
    <small>${locale === 'en' ? 'Web, Desktop and Android included' : 'Bao gồm Web, Desktop và Android'}</small>
  </article>`;
}

export function renderLandingPricingSection(input: {
  readonly locale: LandingLocale;
  readonly registerHref: string;
}): string {
  const { locale } = input;
  return `<section class="pricing-section" id="pricing" aria-labelledby="pricing-title" data-pricing-section data-pricing-locale="${locale}">
    <div class="pricing-atmosphere" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="pricing-inner">
      <header class="pricing-heading reveal" data-reveal>
        <div class="pricing-heading-copy">
          <p class="section-index">05 / ${locale === 'en' ? 'PRICING' : 'BẢNG GIÁ'}</p>
          <h2 id="pricing-title">${locale === 'en' ? 'Plans that grow with your data.' : 'Gói phù hợp với nhịp phát triển.'}</h2>
          <p>${locale === 'en' ? 'Start small, then scale your workspace without changing the way your team works.' : 'Bắt đầu gọn nhẹ, rồi mở rộng không gian dữ liệu mà không phải đổi cách đội ngũ làm việc.'}</p>
        </div>
        <div class="pricing-cycle-control" role="group" aria-label="${locale === 'en' ? 'Billing cycle' : 'Chu kỳ thanh toán'}" data-pricing-cycle-control>
          <button class="active" type="button" aria-pressed="true" data-pricing-cycle="monthly">${locale === 'en' ? 'Monthly' : 'Theo tháng'}</button>
          <button type="button" aria-pressed="false" data-pricing-cycle="annual">${locale === 'en' ? 'Annual' : 'Theo năm'}<span>${locale === 'en' ? '2 months free' : 'Tặng 2 tháng'}</span></button>
          <i aria-hidden="true"></i>
        </div>
        <span class="pricing-a11y-status" aria-live="polite" data-pricing-status></span>
      </header>

      <div class="pricing-trust-row reveal" data-reveal>
        <span><i aria-hidden="true">✓</i>${locale === 'en' ? 'Prices include the complete DataBreeze workspace' : 'Giá đã gồm toàn bộ không gian làm việc DataBreeze'}</span>
        <span><i aria-hidden="true">↻</i>${locale === 'en' ? 'Switch plans as your needs change' : 'Có thể đổi gói khi nhu cầu thay đổi'}</span>
        <span><i aria-hidden="true">∞</i>${locale === 'en' ? 'Unlimited approved Windows folders' : 'Không giới hạn thư mục Windows đã duyệt'}</span>
      </div>

      <div class="pricing-grid" id="pricing-plans">
        ${LANDING_PRICING_PLANS.map((plan) => renderPlan(plan, locale, input.registerHref)).join('')}
      </div>

      <p class="pricing-footnote">${locale === 'en' ? 'Create your account first and choose the final plan later. No payment is taken on this page.' : 'Bạn sẽ tạo tài khoản trước và xác nhận gói sau. Trang này chưa thực hiện thanh toán.'}</p>
    </div>
  </section>`;
}
