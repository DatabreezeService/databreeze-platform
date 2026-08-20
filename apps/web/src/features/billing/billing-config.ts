/**
 * Local QA checkout is enabled only for an explicitly local build. It remains
 * separate from demo mode so HMR can exercise the real API/database while
 * production bundles keep the mock route absent.
 */
export function localMockPaymentsEnabled(): boolean {
  return (
    import.meta.env['VITE_DATABREEZE_DEMO_MODE'] === 'true' ||
    import.meta.env['VITE_DATABREEZE_LOCAL_PAYMENT_MODE'] === 'mock'
  );
}

/** Keep HMR on its current origin when the API points the mock checkout at the
 * built local gateway. Real PayOS links are never rewritten. */
export function resolveBillingCheckoutUrl(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    if (!localMockPaymentsEnabled() || typeof window === 'undefined') return rawUrl;
    const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const mockPath = /^\/vi-VN\/billing\/mock-checkout\/\d+$/u.test(parsed.pathname);
    if (!localHost || parsed.protocol !== 'https:' || !mockPath) return rawUrl;
    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}
