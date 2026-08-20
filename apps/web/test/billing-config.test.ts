import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  localMockPaymentsEnabled,
  resolveBillingCheckoutUrl,
} from '../src/features/billing/billing-config.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('local billing runtime guard [BUA-002, WEB-013]', () => {
  it('keeps the mock checkout available for real HMR API testing without enabling demo mode', () => {
    vi.stubEnv('VITE_DATABREEZE_DEMO_MODE', 'false');
    vi.stubEnv('VITE_DATABREEZE_LOCAL_PAYMENT_MODE', 'mock');

    expect(localMockPaymentsEnabled()).toBe(true);
    expect(
      resolveBillingCheckoutUrl('https://localhost:8443/vi-VN/billing/mock-checkout/123'),
    ).toMatch(/^https?:\/\//u);
  });

  it('does not expose or rewrite the local checkout in a production-shaped bundle', () => {
    vi.stubEnv('VITE_DATABREEZE_DEMO_MODE', 'false');
    vi.stubEnv('VITE_DATABREEZE_LOCAL_PAYMENT_MODE', 'false');

    expect(localMockPaymentsEnabled()).toBe(false);
    expect(resolveBillingCheckoutUrl('https://payos.vn/checkout/123')).toBe(
      'https://payos.vn/checkout/123',
    );
  });
});
