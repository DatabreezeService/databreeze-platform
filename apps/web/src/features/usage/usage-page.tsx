import { useEffect, useState } from 'react';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

type UsageState = { readonly entries: readonly unknown[]; readonly reservations: readonly unknown[] };

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== '' ? configured.replace(/\/$/u, '') : '';
}

function isUsageState(value: unknown): value is UsageState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate['entries']) && Array.isArray(candidate['reservations']);
}

export function UsagePage() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [usage, setUsage] = useState<UsageState>();
  useEffect(() => {
    let active = true;
    const baseUrl = apiBaseUrl();
    const fetcher = createSessionAwareFetchV1({ apiBaseUrl: baseUrl, fetcher: globalThis.fetch.bind(globalThis) });
    void fetcher(`${baseUrl}/v1/entitlements/usage`, { headers: { Accept: 'application/json' }, credentials: 'include' })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok || !isUsageState(payload)) throw new Error('USAGE_REQUEST_FAILED');
        if (active) { setUsage(payload); setState('ready'); }
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);
  return (
    <section aria-label="Mức sử dụng" className="billing-page">
      <header className="billing-page__hero"><div className="billing-page__hero-copy"><p className="billing-page__eyebrow">THEO DÕI SỬ DỤNG</p><h1>Mức sử dụng của không gian dữ liệu</h1><p className="billing-page__intro">Dữ liệu được đọc từ ledger entitlement hiện tại của server.</p></div></header>
      {state === 'loading' ? <p className="billing-page__loading">Đang tải dữ liệu sử dụng…</p> : null}
      {state === 'error' ? <p className="billing-page__status" role="alert">Không thể tải dữ liệu sử dụng.</p> : null}
      {state === 'ready' && usage ? <div className="billing-page__grid"><article className="billing-plan-card"><h2>Ledger entries</h2><p className="billing-page__intro">{usage.entries.length} bản ghi đã ghi nhận.</p></article><article className="billing-plan-card"><h2>Reservations</h2><p className="billing-page__intro">{usage.reservations.length} reservation đang theo dõi.</p></article></div> : null}
    </section>
  );
}
