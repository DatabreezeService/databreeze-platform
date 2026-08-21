import type {
  Feedback,
  FeedbackCategory,
  FeedbackExperience,
  FeedbackRole,
  PlatformAdminFeedbacks,
  PlatformAdminOverview,
} from '@databreeze/contracts/v4';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { createAuthApiV1 } from '../auth/auth-api.ts';
import {
  createPlatformAdminApi,
  PlatformAdminApiError,
  type PlatformAdminWindowDays,
} from './platform-admin-api.ts';
import './platform-admin-page.css';

type LoadState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly overview: PlatformAdminOverview }
  | { readonly state: 'forbidden' }
  | { readonly state: 'error' };

type FeedbacksLoadState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly feedbacks: PlatformAdminFeedbacks }
  | { readonly state: 'forbidden' }
  | { readonly state: 'error' };

const windows: readonly PlatformAdminWindowDays[] = [30, 90, 180, 365];

const copy = {
  'vi-VN': {
    overview: 'Tổng quan vận hành',
    feedbacks: 'Ý kiến & Đánh giá',
    feedbacksTitle: 'Ý kiến & Đánh giá từ Landing Page',
    feedbacksDescription:
      'Tổng hợp phản hồi từ biểu mẫu góp ý trên Landing Page, đọc trực tiếp từ máy chủ DataBreeze.',
    feedbacksInternalMeta: 'PHẢN HỒI NGƯỜI DÙNG',
    anonymousName: 'Khách ẩn danh',
    feedbacksLoading: 'Đang tải góp ý từ máy chủ…',
    feedbacksErrorTitle: 'Chưa thể tải góp ý',
    totalFeedbacks: 'Tổng số lượt góp ý',
    averageRating: 'Điểm đánh giá trung bình',
    openToContact: 'Sẵn sàng liên hệ',
    activeUsersCount: 'Khách hàng sử dụng/dùng thử',
    searchPlaceholder: 'Tìm theo tên, email, công ty, nội dung góp ý…',
    filterCategory: 'Loại góp ý',
    filterRating: 'Đánh giá sao',
    filterRole: 'Vai trò',
    filterExperience: 'Trải nghiệm',
    allCategories: 'Tất cả loại góp ý',
    allRatings: 'Tất cả đánh giá',
    allRoles: 'Tất cả vai trò',
    allExperiences: 'Tất cả trạng thái',
    rating5: '5 sao (Xuất sắc)',
    rating4: '4 sao (Tốt)',
    rating3: '3 sao (Trung bình)',
    rating2: '2 sao (Cần cải thiện)',
    rating1: '1 sao (Kém)',
    showingCount: 'Đang hiển thị',
    ofTotal: 'trên tổng số',
    feedbacksUnit: 'góp ý',
    resetFilters: 'Đặt lại bộ lọc',
    noMatchingFeedback: 'Không tìm thấy góp ý nào phù hợp',
    noMatchingFeedbackSub: 'Vui lòng thử điều chỉnh từ khóa tìm kiếm hoặc các tiêu chí lọc.',
    contactAllowed: 'Sẵn sàng liên hệ',
    contactDenied: 'Chỉ góp ý ẩn danh',
    sendEmail: 'Gửi email',
    roleOwner: 'Chủ doanh nghiệp',
    roleAnalyst: 'Phân tích dữ liệu',
    roleAccounting: 'Kế toán · Tài chính',
    roleOperations: 'Vận hành',
    roleTechnology: 'Công nghệ',
    roleOther: 'Khác',
    expExploring: 'Mới tìm hiểu',
    expTrial: 'Đã dùng thử',
    expActive: 'Đang sử dụng',
    catProduct: 'Trải nghiệm sản phẩm',
    catFeature: 'Đề xuất tính năng',
    catDataTrust: 'Độ tin cậy dữ liệu',
    catDesign: 'Thiết kế · Dễ dùng',
    catPerformance: 'Hiệu năng',
    catOther: 'Khác',
    internal: 'Nội bộ DataBreeze',
    description: 'Bức tranh kinh doanh từ dữ liệu IAM và thanh toán đã xác nhận.',
    refreshed: 'Cập nhật',
    refresh: 'Làm mới',
    workspace: 'Về không gian làm việc',
    signOut: 'Đăng xuất',
    revenue: 'Doanh thu đã thanh toán',
    subscribers: 'Người dùng đã thanh toán',
    activeSubscriptions: 'Gói đang hoạt động',
    users: 'Tổng người dùng',
    organizations: 'Tổ chức',
    workspaces: 'Không gian',
    sessions: 'Phiên đang hoạt động',
    paidOrders: 'Đơn đã thanh toán',
    revenueTrend: 'Doanh thu theo tháng',
    registrationTrend: 'Người dùng mới',
    planMix: 'Cơ cấu gói',
    statusMix: 'Trạng thái thuê bao',
    latestPayments: 'Thanh toán gần đây',
    latestUsers: 'Người dùng gần đây',
    latestSubscriptions: 'Thuê bao gần đây',
    organization: 'Tổ chức',
    plan: 'Gói',
    amount: 'Số tiền',
    status: 'Trạng thái',
    created: 'Thời điểm',
    user: 'Người dùng',
    email: 'Email',
    source: 'Nguồn',
    role: 'Quyền nền tảng',
    forbiddenTitle: 'Tài khoản không có quyền nền tảng',
    forbiddenBody:
      'Quyền Owner hoặc Admin trong workspace không cấp quyền xem dữ liệu kinh doanh toàn hệ thống.',
    errorTitle: 'Chưa thể tải tổng quan',
    errorBody:
      'Kiểm tra API cục bộ rồi thử làm mới. Dữ liệu giả sẽ không được thay thế cho dữ liệu server.',
    retry: 'Thử lại',
    loading: 'Đang tổng hợp dữ liệu vận hành…',
    days: 'ngày',
  },
  en: {
    overview: 'Operating overview',
    feedbacks: 'Feedbacks & Reviews',
    feedbacksTitle: 'Landing Page Feedbacks & Reviews',
    feedbacksDescription:
      'Aggregated feedback submissions from the landing page form, read directly from the DataBreeze server.',
    feedbacksInternalMeta: 'USER FEEDBACK',
    anonymousName: 'Anonymous visitor',
    feedbacksLoading: 'Loading feedback from the server…',
    feedbacksErrorTitle: 'Feedback is unavailable',
    totalFeedbacks: 'Total Feedback Submissions',
    averageRating: 'Average Star Rating',
    openToContact: 'Open to Follow-up',
    activeUsersCount: 'Active / Trial Customers',
    searchPlaceholder: 'Search by name, email, company, feedback content…',
    filterCategory: 'Category',
    filterRating: 'Star Rating',
    filterRole: 'Role',
    filterExperience: 'Experience',
    allCategories: 'All categories',
    allRatings: 'All ratings',
    allRoles: 'All roles',
    allExperiences: 'All statuses',
    rating5: '5 stars (Excellent)',
    rating4: '4 stars (Good)',
    rating3: '3 stars (Average)',
    rating2: '2 stars (Needs work)',
    rating1: '1 star (Poor)',
    showingCount: 'Showing',
    ofTotal: 'of',
    feedbacksUnit: 'reviews',
    resetFilters: 'Reset filters',
    noMatchingFeedback: 'No matching feedback found',
    noMatchingFeedbackSub: 'Try adjusting your search keywords or filter criteria.',
    contactAllowed: 'Open to follow-up',
    contactDenied: 'Anonymous submission',
    sendEmail: 'Send email',
    roleOwner: 'Business Owner',
    roleAnalyst: 'Data Analyst',
    roleAccounting: 'Accounting & Finance',
    roleOperations: 'Operations',
    roleTechnology: 'Technology',
    roleOther: 'Other',
    expExploring: 'Exploring',
    expTrial: 'Trial',
    expActive: 'Active user',
    catProduct: 'Product experience',
    catFeature: 'Feature request',
    catDataTrust: 'Data trust',
    catDesign: 'Design & UX',
    catPerformance: 'Performance',
    catOther: 'Other',
    internal: 'DataBreeze internal',
    description: 'A business view built from authoritative IAM and settled billing data.',
    refreshed: 'Updated',
    refresh: 'Refresh',
    workspace: 'Back to workspace',
    signOut: 'Sign out',
    revenue: 'Settled revenue',
    subscribers: 'Paying users',
    activeSubscriptions: 'Active subscriptions',
    users: 'Total users',
    organizations: 'Organizations',
    workspaces: 'Workspaces',
    sessions: 'Active sessions',
    paidOrders: 'Paid orders',
    revenueTrend: 'Monthly revenue',
    registrationTrend: 'New users',
    planMix: 'Plan mix',
    statusMix: 'Subscription status',
    latestPayments: 'Recent payments',
    latestUsers: 'Recent users',
    latestSubscriptions: 'Recent subscriptions',
    organization: 'Organization',
    plan: 'Plan',
    amount: 'Amount',
    status: 'Status',
    created: 'Created',
    user: 'User',
    email: 'Email',
    source: 'Source',
    role: 'Platform role',
    forbiddenTitle: 'This account has no platform authority',
    forbiddenBody:
      'Workspace Owner or Admin membership does not grant access to product-wide business data.',
    errorTitle: 'The overview is unavailable',
    errorBody:
      'Check the local API and retry. Synthetic UI data is never substituted for server data.',
    retry: 'Try again',
    loading: 'Aggregating operating data…',
    days: 'days',
  },
} as const;

function roleLabel(role: FeedbackRole, locale: 'vi-VN' | 'en'): string {
  const text = copy[locale];
  switch (role) {
    case 'owner':
      return text.roleOwner;
    case 'analyst':
      return text.roleAnalyst;
    case 'accounting':
      return text.roleAccounting;
    case 'operations':
      return text.roleOperations;
    case 'technology':
      return text.roleTechnology;
    case 'other':
    default:
      return text.roleOther;
  }
}

function experienceLabel(exp: FeedbackExperience, locale: 'vi-VN' | 'en'): string {
  const text = copy[locale];
  switch (exp) {
    case 'active':
      return text.expActive;
    case 'trial':
      return text.expTrial;
    case 'exploring':
    default:
      return text.expExploring;
  }
}

function categoryLabel(cat: FeedbackCategory, locale: 'vi-VN' | 'en'): string {
  const text = copy[locale];
  switch (cat) {
    case 'product':
      return text.catProduct;
    case 'feature':
      return text.catFeature;
    case 'data-trust':
      return text.catDataTrust;
    case 'design':
      return text.catDesign;
    case 'performance':
      return text.catPerformance;
    case 'other':
    default:
      return text.catOther;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/u);
  if (parts.length === 0 || parts[0] === undefined) return 'DB';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

const SEEDED_FEEDBACK_ID_PREFIX = '00000000-0000-4000-8000-';

function feedbackDisplayId(id: string): string {
  if (id.startsWith(SEEDED_FEEDBACK_ID_PREFIX)) {
    const numericSuffix = id.slice(SEEDED_FEEDBACK_ID_PREFIX.length);
    if (/^\d{12}$/u.test(numericSuffix)) {
      const seedNumber = Number(numericSuffix);
      if (seedNumber >= 8_900 && seedNumber <= 8_911) {
        return `FB-${String(seedNumber - 8_899).padStart(2, '0')}`;
      }
    }
  }

  return id.replaceAll('-', '').slice(0, 8).toUpperCase();
}

function planLabel(value: string): string {
  return value
    .replace('professional', 'Professional')
    .replace('personal', 'Personal')
    .replace('team', 'Team')
    .replace('-monthly', ' · monthly')
    .replace('-annual', ' · annual');
}

function statusLabel(value: string, locale: 'vi-VN' | 'en'): string {
  const labels: Record<string, readonly [string, string]> = {
    ACTIVE: ['Đang hoạt động', 'Active'],
    PAID: ['Đã thanh toán', 'Paid'],
    PENDING: ['Đang chờ', 'Pending'],
    FAILED: ['Thất bại', 'Failed'],
    CANCELLED: ['Đã huỷ', 'Cancelled'],
    PAST_DUE: ['Quá hạn', 'Past due'],
    SUSPENDED: ['Tạm ngưng', 'Suspended'],
  };
  const label = labels[value];
  return label === undefined ? value : label[locale === 'vi-VN' ? 0 : 1];
}

function statusTone(value: string): string {
  if (value === 'ACTIVE' || value === 'PAID') return 'positive';
  if (value === 'PENDING' || value === 'PAST_DUE') return 'warning';
  return 'negative';
}

function StarRating({ rating }: { readonly rating: number }) {
  return (
    <div aria-label={`${rating} out of 5 stars`} className="pa-star-rating" role="img">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          aria-hidden="true"
          className={`pa-star ${star <= rating ? 'pa-star--filled' : 'pa-star--empty'}`}
          key={star}
        >
          ★
        </span>
      ))}
      <span className="pa-star-score">{rating}/5</span>
    </div>
  );
}

function PlatformAdminFeedbacksView({
  locale,
  dateTime,
  number,
  data,
}: {
  readonly locale: 'vi-VN' | 'en';
  readonly dateTime: Intl.DateTimeFormat;
  readonly number: Intl.NumberFormat;
  readonly data: PlatformAdminFeedbacks;
}) {
  const text = copy[locale];
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRating, setSelectedRating] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedExperience, setSelectedExperience] = useState<string>('all');

  const items = data.feedbacks;

  const stats = useMemo(() => {
    const total = items.length;
    const avgRating = items.reduce((acc, curr) => acc + curr.rating, 0) / (total || 1);
    const contactable = items.filter((i) => i.contactPermission).length;
    const byExperience = (experience: FeedbackExperience) =>
      items.filter((i) => i.experience === experience).length;
    const fiveStars = items.filter((i) => i.rating === 5).length;
    return {
      total,
      avgRating: avgRating.toFixed(1),
      fiveStars,
      contactable,
      contactablePercent: Math.round((contactable / (total || 1)) * 100),
      activeOrTrial: byExperience('active') + byExperience('trial'),
      active: byExperience('active'),
      trial: byExperience('trial'),
      exploring: byExperience('exploring'),
    };
  }, [items]);

  const filteredFeedbacks = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedRating !== 'all' && String(item.rating) !== selectedRating) return false;
      if (selectedRole !== 'all' && item.role !== selectedRole) return false;
      if (selectedExperience !== 'all' && item.experience !== selectedExperience) return false;
      if (search.trim() !== '') {
        const query = search.trim().toLowerCase();
        const matchesName = (item.name ?? '').toLowerCase().includes(query);
        const matchesOrg = (item.organization ?? '').toLowerCase().includes(query);
        const matchesEmail = item.contactPermission && item.email.toLowerCase().includes(query);
        const matchesMsg = item.message.toLowerCase().includes(query);
        if (!matchesName && !matchesOrg && !matchesEmail && !matchesMsg) return false;
      }
      return true;
    });
  }, [items, search, selectedCategory, selectedRating, selectedRole, selectedExperience]);

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedCategory !== 'all' ||
    selectedRating !== 'all' ||
    selectedRole !== 'all' ||
    selectedExperience !== 'all';

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSelectedRating('all');
    setSelectedRole('all');
    setSelectedExperience('all');
  };

  return (
    <div className="pa-feedbacks-view">
      <header className="pa-header">
        <div>
          <div className="pa-header__meta">
            <span>{text.feedbacksInternalMeta}</span>
            <span>LANDING PAGE</span>
          </div>
          <h1>{text.feedbacksTitle}</h1>
          <p>{text.feedbacksDescription}</p>
        </div>
      </header>

      <section aria-label="Feedback Metrics" className="pa-kpis pa-feedbacks-kpis">
        <article className="pa-kpi pa-kpi--primary">
          <span>{text.totalFeedbacks}</span>
          <strong>{number.format(data.total)}</strong>
          <small>
            {stats.fiveStars}/{stats.total}{' '}
            {locale === 'vi-VN' ? 'đánh giá 5★ tuyệt đối' : 'perfect 5★ reviews'}
          </small>
        </article>

        <article className="pa-kpi">
          <span>{text.averageRating}</span>
          <div className="pa-kpi-rating-row">
            <strong>{stats.avgRating}</strong>
            <span className="pa-kpi-stars" aria-hidden="true">
              ★★★★★
            </span>
          </div>
          <small>{locale === 'vi-VN' ? 'Độ hài lòng người dùng' : 'User satisfaction index'}</small>
        </article>

        <article className="pa-kpi">
          <span>{text.openToContact}</span>
          <strong>{stats.contactablePercent}%</strong>
          <small>
            {stats.contactable}/{stats.total}{' '}
            {locale === 'vi-VN' ? 'sẵn sàng trao đổi thêm' : 'consented to follow-up'}
          </small>
        </article>

        <article className="pa-kpi">
          <span>{text.activeUsersCount}</span>
          <strong>{stats.activeOrTrial}</strong>
          <small>
            {locale === 'vi-VN'
              ? `${stats.active} đang dùng · ${stats.trial} dùng thử · ${stats.exploring} tìm hiểu`
              : `${stats.active} active · ${stats.trial} trial · ${stats.exploring} exploring`}
          </small>
        </article>
      </section>

      <div className="pa-feedbacks-toolbar">
        <div className="pa-search-wrap">
          <span aria-hidden="true" className="pa-search-icon">
            🔍
          </span>
          <input
            aria-label={text.searchPlaceholder}
            className="pa-search-input"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={text.searchPlaceholder}
            type="search"
            value={search}
          />
          {search && (
            <button
              aria-label="Clear search"
              className="pa-search-clear"
              onClick={() => setSearch('')}
              type="button"
            >
              ✕
            </button>
          )}
        </div>

        <div className="pa-feedbacks-filters">
          <div className="pa-filter-item">
            <label htmlFor="filter-category">{text.filterCategory}:</label>
            <select
              id="filter-category"
              onChange={(e) => setSelectedCategory(e.target.value)}
              value={selectedCategory}
            >
              <option value="all">{text.allCategories}</option>
              <option value="product">{text.catProduct}</option>
              <option value="feature">{text.catFeature}</option>
              <option value="data-trust">{text.catDataTrust}</option>
              <option value="design">{text.catDesign}</option>
              <option value="performance">{text.catPerformance}</option>
              <option value="other">{text.catOther}</option>
            </select>
          </div>

          <div className="pa-filter-item">
            <label htmlFor="filter-rating">{text.filterRating}:</label>
            <select
              id="filter-rating"
              onChange={(e) => setSelectedRating(e.target.value)}
              value={selectedRating}
            >
              <option value="all">{text.allRatings}</option>
              <option value="5">{text.rating5}</option>
              <option value="4">{text.rating4}</option>
              <option value="3">{text.rating3}</option>
            </select>
          </div>

          <div className="pa-filter-item">
            <label htmlFor="filter-role">{text.filterRole}:</label>
            <select
              id="filter-role"
              onChange={(e) => setSelectedRole(e.target.value)}
              value={selectedRole}
            >
              <option value="all">{text.allRoles}</option>
              <option value="owner">{text.roleOwner}</option>
              <option value="analyst">{text.roleAnalyst}</option>
              <option value="accounting">{text.roleAccounting}</option>
              <option value="operations">{text.roleOperations}</option>
              <option value="technology">{text.roleTechnology}</option>
              <option value="other">{text.roleOther}</option>
            </select>
          </div>

          <div className="pa-filter-item">
            <label htmlFor="filter-experience">{text.filterExperience}:</label>
            <select
              id="filter-experience"
              onChange={(e) => setSelectedExperience(e.target.value)}
              value={selectedExperience}
            >
              <option value="all">{text.allExperiences}</option>
              <option value="active">{text.expActive}</option>
              <option value="trial">{text.expTrial}</option>
              <option value="exploring">{text.expExploring}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pa-feedbacks-summary-bar">
        <span>
          {text.showingCount} <strong>{filteredFeedbacks.length}</strong> {text.ofTotal}{' '}
          {data.total} {text.feedbacksUnit}
        </span>
        {hasActiveFilters && (
          <button className="pa-reset-filters-btn" onClick={handleResetFilters} type="button">
            ↻ {text.resetFilters}
          </button>
        )}
      </div>

      {filteredFeedbacks.length === 0 ? (
        <div className="pa-empty-feedbacks">
          <span aria-hidden="true" className="pa-empty-icon">
            💬
          </span>
          <h2>{text.noMatchingFeedback}</h2>
          <p>{text.noMatchingFeedbackSub}</p>
          <button className="pa-reset-filters-btn" onClick={handleResetFilters} type="button">
            {text.resetFilters}
          </button>
        </div>
      ) : (
        <div className="pa-feedbacks-grid" role="feed" aria-label="Customer Reviews">
          {filteredFeedbacks.map((item: Feedback) => (
            <article className="pa-feedback-card" key={item.id}>
              <div className="pa-feedback-card__header">
                <div className="pa-feedback-author">
                  <div aria-hidden="true" className="pa-author-avatar">
                    {getInitials(item.name ?? item.email)}
                  </div>
                  <div className="pa-author-info">
                    <div className="pa-author-headline">
                      <strong className="pa-author-name">{item.name ?? text.anonymousName}</strong>
                      <span className="pa-role-badge">{roleLabel(item.role, locale)}</span>
                    </div>
                    <div className="pa-author-meta">
                      {item.organization === undefined ? null : (
                        <span className="pa-org-name">{item.organization}</span>
                      )}
                      {item.organization === undefined ? null : (
                        <span className="pa-author-dot" aria-hidden="true">
                          ·
                        </span>
                      )}
                      <span className="pa-date-str">
                        {dateTime.format(new Date(item.createdAt))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pa-feedback-rating-badge">
                  <StarRating rating={item.rating} />
                </div>
              </div>

              <div className="pa-feedback-card__tags">
                <span className={`pa-tag pa-tag--cat pa-tag--cat-${item.category}`}>
                  {categoryLabel(item.category, locale)}
                </span>
                <span className={`pa-tag pa-tag--exp pa-tag--exp-${item.experience}`}>
                  ● {experienceLabel(item.experience, locale)}
                </span>
              </div>

              <div className="pa-feedback-card__body">
                <blockquote className="pa-feedback-message">“{item.message}”</blockquote>
              </div>

              <div className="pa-feedback-card__footer">
                <div className="pa-feedback-contact-state">
                  {item.contactPermission ? (
                    <span className="pa-contact-pill pa-contact-pill--allowed">
                      <span aria-hidden="true" className="pa-contact-check">
                        ✓
                      </span>
                      <span>{text.contactAllowed}:</span>
                      <a href={`mailto:${item.email}`} title={`${text.sendEmail}: ${item.email}`}>
                        {item.email}
                      </a>
                    </span>
                  ) : (
                    <span className="pa-contact-pill pa-contact-pill--denied">
                      <span aria-hidden="true" className="pa-contact-x">
                        ✕
                      </span>
                      <span>{text.contactDenied}</span>
                    </span>
                  )}
                </div>

                <span className="pa-feedback-id">#{feedbackDisplayId(item.id)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Distribution({
  groups,
  label,
  formatKey,
}: {
  readonly groups: PlatformAdminOverview['subscriptionPlans'];
  readonly label: string;
  readonly formatKey: (value: string) => string;
}) {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <section className="pa-distribution" aria-label={label}>
      <div className="pa-section-heading">
        <h2>{label}</h2>
        <span>{total}</span>
      </div>
      <div className="pa-distribution__rows">
        {groups.map((group) => (
          <div className="pa-distribution__row" key={group.key}>
            <div>
              <span>{formatKey(group.key)}</span>
              <strong>{group.count}</strong>
            </div>
            <div className="pa-distribution__track" aria-hidden="true">
              <span
                style={{
                  inlineSize: `${total === 0 ? 0 : Math.max(5, (group.count / total) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RevenueChart({
  series,
  compactNumber,
  currency,
  label,
}: {
  readonly series: PlatformAdminOverview['revenueSeries'];
  readonly compactNumber: Intl.NumberFormat;
  readonly currency: Intl.NumberFormat;
  readonly label: string;
}) {
  const firstRevenueIndex = series.findIndex((point) => point.revenueVnd > 0);
  const displaySeries = firstRevenueIndex > 0 ? series.slice(firstRevenueIndex) : series;
  const width = 720;
  const height = 292;
  const left = 62;
  const right = 680;
  const top = 20;
  const bottom = 250;
  const maximum = Math.max(1, ...displaySeries.map((point) => point.revenueVnd));
  const x = (index: number) =>
    displaySeries.length <= 1 ? left : left + (index / (displaySeries.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / maximum) * (bottom - top);
  const points = displaySeries
    .map((point, index) => `${x(index)},${y(point.revenueVnd)}`)
    .join(' ');
  const area = `${left},${bottom} ${points} ${right},${bottom}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="pa-native-chart">
      <svg aria-label={label} role="img" viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((tick) => {
          const tickY = bottom - tick * (bottom - top);
          return (
            <g key={tick}>
              <line className="pa-chart-gridline" x1={left} x2={right} y1={tickY} y2={tickY} />
              <text className="pa-chart-axis" textAnchor="end" x={left - 10} y={tickY + 4}>
                {compactNumber.format(maximum * tick)}
              </text>
            </g>
          );
        })}
        <polygon className="pa-revenue-area" points={area} />
        <polyline className="pa-revenue-line" points={points} />
        {displaySeries.map((point, index) => (
          <g key={point.month}>
            <circle className="pa-revenue-point" cx={x(index)} cy={y(point.revenueVnd)} r="3.5">
              <title>{`${point.month}: ${currency.format(point.revenueVnd)}`}</title>
            </circle>
            <text className="pa-chart-axis" textAnchor="middle" x={x(index)} y={bottom + 25}>
              {point.month}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function RegistrationChart({
  series,
  number,
  label,
}: {
  readonly series: PlatformAdminOverview['registrationSeries'];
  readonly number: Intl.NumberFormat;
  readonly label: string;
}) {
  const firstRegistrationIndex = series.findIndex((point) => point.count > 0);
  const displaySeries = firstRegistrationIndex > 0 ? series.slice(firstRegistrationIndex) : series;
  const width = 460;
  const height = 292;
  const left = 44;
  const right = 448;
  const top = 20;
  const bottom = 250;
  const maximum = Math.max(1, ...displaySeries.map((point) => point.count));
  const slot = (right - left) / Math.max(1, displaySeries.length);
  const barWidth = Math.max(10, slot * 0.58);
  const ticks = [0, 0.5, 1];
  return (
    <div className="pa-native-chart">
      <svg aria-label={label} role="img" viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((tick) => {
          const tickY = bottom - tick * (bottom - top);
          return (
            <g key={tick}>
              <line className="pa-chart-gridline" x1={left} x2={right} y1={tickY} y2={tickY} />
              <text className="pa-chart-axis" textAnchor="end" x={left - 9} y={tickY + 4}>
                {number.format(Math.round(maximum * tick))}
              </text>
            </g>
          );
        })}
        {displaySeries.map((point, index) => {
          const barHeight = (point.count / maximum) * (bottom - top);
          const barX = left + index * slot + (slot - barWidth) / 2;
          return (
            <g key={point.month}>
              <rect
                className="pa-registration-bar"
                height={barHeight}
                rx="4"
                width={barWidth}
                x={barX}
                y={bottom - barHeight}
              >
                <title>{`${point.month}: ${number.format(point.count)}`}</title>
              </rect>
              <text
                className="pa-chart-axis"
                textAnchor="middle"
                x={barX + barWidth / 2}
                y={bottom + 25}
              >
                {index % 2 === 0 || displaySeries.length <= 7 ? point.month : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PlatformAdminRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const text = copy[locale];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'feedbacks' ? 'feedbacks' : 'overview';

  const api = useMemo(() => createPlatformAdminApi(), []);
  const [days, setDays] = useState<PlatformAdminWindowDays>(180);
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [feedbacksLoad, setFeedbacksLoad] = useState<FeedbacksLoadState>({ state: 'loading' });

  const loadOverview = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    let active = true;
    setLoad({ state: 'loading' });
    void api
      .readOverview(days)
      .then((overview) => {
        if (active) setLoad({ state: 'ready', overview });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoad(
          error instanceof PlatformAdminApiError && error.status === 403
            ? { state: 'forbidden' }
            : { state: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [api, days, reload, activeTab]);

  useEffect(() => {
    let active = true;
    setFeedbacksLoad({ state: 'loading' });
    void api
      .readFeedbacks()
      .then((feedbacks) => {
        if (active) setFeedbacksLoad({ state: 'ready', feedbacks });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFeedbacksLoad(
          error instanceof PlatformAdminApiError && error.status === 403
            ? { state: 'forbidden' }
            : { state: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [api, reload]);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const compactNumber = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    [locale],
  );
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' }),
    [locale],
  );
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const renderOverviewState = () => {
    if (load.state === 'loading')
      return (
        <div className="pa-state" role="status">
          <span className="pa-state__pulse" aria-hidden="true" />
          <p>{text.loading}</p>
        </div>
      );
    if (load.state === 'forbidden' || load.state === 'error') {
      const forbidden = load.state === 'forbidden';
      return (
        <div className="pa-state pa-state--message">
          <span className="pa-state__code">{forbidden ? '403' : '503'}</span>
          <h1>{forbidden ? text.forbiddenTitle : text.errorTitle}</h1>
          <p>{forbidden ? text.forbiddenBody : text.errorBody}</p>
          <div className="pa-state__actions">
            {!forbidden ? <button onClick={loadOverview}>{text.retry}</button> : null}
            <Link to={`/${locale}/data`}>{text.workspace}</Link>
          </div>
        </div>
      );
    }

    const { overview } = load;
    const totals = overview.totals;
    return (
      <>
        <header className="pa-header">
          <div>
            <div className="pa-header__meta">
              <span>{text.internal}</span>
              <span>
                {text.role}: {overview.operator.role.replace('PLATFORM_', '')}
              </span>
            </div>
            <h1>{text.overview}</h1>
            <p>{text.description}</p>
          </div>
          <div className="pa-header__controls">
            <div className="pa-window" aria-label="Reporting period">
              {windows.map((windowDays) => (
                <button
                  aria-pressed={days === windowDays}
                  key={windowDays}
                  onClick={() => setDays(windowDays)}
                >
                  {windowDays} {text.days}
                </button>
              ))}
            </div>
            <button className="pa-refresh" onClick={loadOverview} type="button">
              ↻ {text.refresh}
            </button>
          </div>
        </header>

        <p className="pa-freshness">
          <span aria-hidden="true" /> {text.refreshed}{' '}
          {dateTime.format(new Date(overview.generatedAt))}
        </p>

        <section className="pa-kpis" aria-label={text.overview}>
          {[
            [
              text.revenue,
              currency.format(totals.settledRevenueVnd),
              `${number.format(totals.paidOrders)} ${text.paidOrders.toLowerCase()}`,
            ],
            [
              text.subscribers,
              number.format(totals.subscriberUsers),
              `${number.format(totals.activeSubscriptions)} ${text.activeSubscriptions.toLowerCase()}`,
            ],
            [
              text.activeSubscriptions,
              number.format(totals.activeSubscriptions),
              `${number.format(totals.subscriptions)} total`,
            ],
            [
              text.users,
              number.format(totals.users),
              `${number.format(totals.activeUsers)} active`,
            ],
          ].map(([label, value, detail], index) => (
            <article className={`pa-kpi${index === 0 ? ' pa-kpi--primary' : ''}`} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </section>

        <div className="pa-facts" aria-label="Platform counts">
          {[
            [text.organizations, totals.organizations],
            [text.workspaces, totals.workspaces],
            [text.sessions, totals.activeSessions],
            [text.paidOrders, totals.paidOrders],
          ].map(([label, value]) => (
            <span key={String(label)}>
              <b>{number.format(Number(value))}</b> {label}
            </span>
          ))}
        </div>

        <div className="pa-chart-grid">
          <section className="pa-chart pa-chart--revenue">
            <div className="pa-section-heading">
              <div>
                <span>BUA</span>
                <h2>{text.revenueTrend}</h2>
              </div>
              <strong>{currency.format(totals.settledRevenueVnd)}</strong>
            </div>
            <RevenueChart
              compactNumber={compactNumber}
              currency={currency}
              label={text.revenueTrend}
              series={overview.revenueSeries}
            />
          </section>
          <section className="pa-chart">
            <div className="pa-section-heading">
              <div>
                <span>IAM</span>
                <h2>{text.registrationTrend}</h2>
              </div>
              <strong>{number.format(totals.users)}</strong>
            </div>
            <RegistrationChart
              label={text.registrationTrend}
              number={number}
              series={overview.registrationSeries}
            />
          </section>
        </div>

        <div className="pa-distribution-grid">
          <Distribution
            groups={overview.subscriptionPlans}
            label={text.planMix}
            formatKey={planLabel}
          />
          <Distribution
            groups={overview.subscriptionStatuses}
            label={text.statusMix}
            formatKey={(value) => statusLabel(value, locale)}
          />
        </div>

        <section className="pa-table-section">
          <div className="pa-section-heading">
            <div>
              <span>PAYOS</span>
              <h2>{text.latestPayments}</h2>
            </div>
          </div>
          <div className="pa-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{text.organization}</th>
                  <th>{text.plan}</th>
                  <th>{text.amount}</th>
                  <th>{text.status}</th>
                  <th>{text.created}</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentPayments.map((payment) => (
                  <tr key={payment.paymentOrderId}>
                    <td>
                      <strong>{payment.organizationName}</strong>
                      <small>{payment.organizationId.slice(0, 8)}…</small>
                    </td>
                    <td>{planLabel(payment.planId)}</td>
                    <td className="pa-table__number">{currency.format(payment.amountVnd)}</td>
                    <td>
                      <span className={`pa-status pa-status--${statusTone(payment.status)}`}>
                        {statusLabel(payment.status, locale)}
                      </span>
                    </td>
                    <td>{dateTime.format(new Date(payment.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="pa-detail-grid">
          <section className="pa-table-section">
            <div className="pa-section-heading">
              <div>
                <span>IAM</span>
                <h2>{text.latestUsers}</h2>
              </div>
            </div>
            <div className="pa-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{text.user}</th>
                    <th>{text.status}</th>
                    <th>{text.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentUsers.slice(0, 7).map((user) => (
                    <tr key={user.userId}>
                      <td>
                        <strong>{user.displayName}</strong>
                        <small>{user.email}</small>
                      </td>
                      <td>
                        <span className={`pa-status pa-status--${statusTone(user.status)}`}>
                          {statusLabel(user.status, locale)}
                        </span>
                      </td>
                      <td>{dateTime.format(new Date(user.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="pa-table-section">
            <div className="pa-section-heading">
              <div>
                <span>BUA</span>
                <h2>{text.latestSubscriptions}</h2>
              </div>
            </div>
            <div className="pa-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{text.organization}</th>
                    <th>{text.plan}</th>
                    <th>{text.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentSubscriptions.slice(0, 7).map((subscription) => (
                    <tr key={subscription.subscriptionId}>
                      <td>
                        <strong>{subscription.organizationName}</strong>
                        <small>{subscription.source}</small>
                      </td>
                      <td>{planLabel(subscription.planId)}</td>
                      <td>
                        <span className={`pa-status pa-status--${statusTone(subscription.status)}`}>
                          {statusLabel(subscription.status, locale)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>
    );
  };

  const renderFeedbacksState = () => {
    if (feedbacksLoad.state === 'loading')
      return (
        <div className="pa-state" role="status">
          <span className="pa-state__pulse" aria-hidden="true" />
          <p>{text.feedbacksLoading}</p>
        </div>
      );
    if (feedbacksLoad.state === 'forbidden' || feedbacksLoad.state === 'error') {
      const forbidden = feedbacksLoad.state === 'forbidden';
      return (
        <div className="pa-state pa-state--message">
          <span className="pa-state__code">{forbidden ? '403' : '503'}</span>
          <h1>{forbidden ? text.forbiddenTitle : text.feedbacksErrorTitle}</h1>
          <p>{forbidden ? text.forbiddenBody : text.errorBody}</p>
          <div className="pa-state__actions">
            {!forbidden ? <button onClick={loadOverview}>{text.retry}</button> : null}
            <Link to={`/${locale}/data`}>{text.workspace}</Link>
          </div>
        </div>
      );
    }
    return (
      <PlatformAdminFeedbacksView
        data={feedbacksLoad.feedbacks}
        dateTime={dateTime}
        locale={locale}
        number={number}
      />
    );
  };

  return (
    <div className="pa-shell">
      <a className="skip-link" href="#platform-admin-main">
        Skip to content
      </a>
      <aside className="pa-rail">
        <Link className="pa-brand" to={`/${locale}/platform-admin`}>
          <span aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>DataBreeze</strong>
        </Link>
        <p>PLATFORM OPS</p>
        <nav aria-label="Platform navigation">
          <Link
            aria-current={activeTab === 'overview' ? 'page' : undefined}
            className={`pa-rail-link ${activeTab === 'overview' ? 'active' : ''}`}
            to={`/${locale}/platform-admin`}
          >
            <span>⌁</span>
            {text.overview}
          </Link>
          <Link
            aria-current={activeTab === 'feedbacks' ? 'page' : undefined}
            className={`pa-rail-link ${activeTab === 'feedbacks' ? 'active' : ''}`}
            to={`/${locale}/platform-admin?tab=feedbacks`}
          >
            <span>★</span>
            <span className="pa-rail-link__label">{text.feedbacks}</span>
            {feedbacksLoad.state === 'ready' ? (
              <span className="pa-rail-badge">{feedbacksLoad.feedbacks.total}</span>
            ) : null}
          </Link>
        </nav>
        <div className="pa-rail__footer">
          <span>
            <i /> Server authority
          </span>
          <Link to={`/${locale}/data`}>← {text.workspace}</Link>
          <button
            onClick={() => {
              const configuredBaseUrl: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
              void (async () => {
                const result = await createAuthApiV1({
                  baseUrl: typeof configuredBaseUrl === 'string' ? configuredBaseUrl : '',
                }).signOut();
                if (result.accepted) void navigate(`/${locale}/sign-in`, { replace: true });
              })();
            }}
          >
            {text.signOut}
          </button>
        </div>
      </aside>
      <main className="pa-main" id="platform-admin-main" tabIndex={-1}>
        {activeTab === 'feedbacks' ? renderFeedbacksState() : renderOverviewState()}
      </main>
    </div>
  );
}
