import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';
import '../billing/billing-page.css';
import { fetchEntitlementSummary, type EntitlementSummaryV1 } from './entitlement-api.ts';

type UsageState = {
  readonly entries: readonly unknown[];
  readonly reservations: readonly unknown[];
};
function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function isUsageState(value: unknown): value is UsageState {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as Record<string, unknown>)['entries']) &&
    Array.isArray((value as Record<string, unknown>)['reservations'])
  );
}

export function UsagePage() {
  const { locale = 'vi-VN' } = useParams();
  const english = locale === 'en';
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [summary, setSummary] = useState<EntitlementSummaryV1>();
  const [usage, setUsage] = useState<UsageState>();
  const load = useCallback(async () => {
    setState('loading');
    const baseUrl = apiBaseUrl();
    const fetcher = createSessionAwareFetchV1({
      apiBaseUrl: baseUrl,
      fetcher: globalThis.fetch.bind(globalThis),
    });
    try {
      const [nextSummary, usageResponse] = await Promise.all([
        fetchEntitlementSummary({ baseUrl, fetcher: globalThis.fetch.bind(globalThis) }, undefined),
        fetcher(`${baseUrl}/v1/entitlements/usage`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }),
      ]);
      const usagePayload: unknown = await usageResponse.json().catch(() => undefined);
      if (!usageResponse.ok || !isUsageState(usagePayload)) throw new Error('USAGE_REQUEST_FAILED');
      setSummary(nextSummary);
      setUsage(usagePayload);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const credits = summary?.aiCredits;
  const percent =
    credits && credits.limit > 0
      ? Math.min(100, Math.round(((credits.used + credits.reserved) / credits.limit) * 100))
      : 0;
  return (
    <section aria-label={english ? 'Workspace usage' : 'Mức sử dụng'} className="billing-page">
      <header className="billing-page__hero">
        <div className="billing-page__hero-copy">
          <p className="billing-page__eyebrow">
            {english ? 'WORKSPACE USAGE' : 'THEO DÕI SỬ DỤNG'}
          </p>
          <h1>
            {english
              ? 'Know what your workspace can do next'
              : 'Biết workspace còn có thể làm gì tiếp theo'}
          </h1>
          <p className="billing-page__intro">
            {english
              ? 'Every number below comes from the server entitlement snapshot and append-only ledger.'
              : 'Mọi con số dưới đây đều đến từ entitlement snapshot và ledger bất biến của server.'}
          </p>
        </div>
        <Link className="billing-return__primary" to={`/${locale}/billing`}>
          {english ? 'View plans' : 'Xem gói dịch vụ'}
        </Link>
      </header>
      {state === 'loading' ? (
        <p className="billing-page__loading">
          {english ? 'Loading usage…' : 'Đang tải mức sử dụng…'}
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="billing-page__status" role="alert">
          {english ? 'Usage is unavailable right now.' : 'Chưa thể tải mức sử dụng lúc này.'}
          <button className="usage-page__retry" onClick={() => void load()} type="button">
            {english ? 'Retry' : 'Thử lại'}
          </button>
        </div>
      ) : null}
      {state === 'ready' && summary && usage && credits ? (
        <>
          <div className="billing-page__section-heading">
            <div>
              <h2>{english ? 'AI credits' : 'Tín dụng AI'}</h2>
              <p>
                {english
                  ? `Plan ${summary.snapshot.planCode} · revision ${summary.snapshot.revision}`
                  : `Gói ${summary.snapshot.planCode} · phiên bản ${summary.snapshot.revision}`}
              </p>
            </div>
            <span className="billing-page__server-badge">{summary.snapshot.status}</span>
          </div>
          <div className="usage-page__credit-card">
            <div className="usage-page__credit-copy">
              <span>{english ? 'Available for agent work' : 'Còn lại cho tác vụ trợ lý'}</span>
              <strong>
                {new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(credits.remaining)}
              </strong>
              <small>
                {english
                  ? `${credits.used} used · ${credits.reserved} reserved of ${credits.limit}`
                  : `${credits.used} đã dùng · ${credits.reserved} đang giữ trên ${credits.limit}`}
              </small>
            </div>
            <div aria-label={`${percent}%`} className="usage-page__credit-meter">
              <span style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
          </div>
          <div className="billing-page__grid usage-page__ledger-grid">
            <article className="billing-plan-card">
              <span className="usage-page__label">
                {english ? 'Committed work' : 'Tác vụ đã ghi nhận'}
              </span>
              <strong className="usage-page__metric">{usage.entries.length}</strong>
              <p>
                {english
                  ? 'Append-only ledger entries visible in this scope.'
                  : 'Bản ghi ledger bất biến trong phạm vi hiện tại.'}
              </p>
            </article>
            <article className="billing-plan-card">
              <span className="usage-page__label">
                {english ? 'Active reservations' : 'Reservation đang giữ'}
              </span>
              <strong className="usage-page__metric">{usage.reservations.length}</strong>
              <p>
                {english
                  ? 'Usage reserved by in-flight work.'
                  : 'Mức dùng đang được giữ cho tác vụ đang chạy.'}
              </p>
            </article>
            <article className="billing-plan-card">
              <span className="usage-page__label">
                {english ? 'Next action' : 'Bước tiếp theo'}
              </span>
              <strong className="usage-page__metric">{credits.remaining > 0 ? '✓' : '!'}</strong>
              <p>
                {credits.remaining > 0
                  ? english
                    ? 'You can keep working.'
                    : 'Bạn có thể tiếp tục làm việc.'
                  : english
                    ? 'Choose a larger plan before starting more agent work.'
                    : 'Chọn gói cao hơn trước khi chạy thêm tác vụ trợ lý.'}
              </p>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
