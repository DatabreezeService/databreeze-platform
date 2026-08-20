import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  MockPayosPaymentLinkAdapter,
  PayosPaymentLinkAdapter,
} from '../../../src/features/bua/adapter/payos-payment-link.adapter.js';
import { findPayosPlan } from '../../../src/features/bua/application/payos-plan-catalog.js';

void test('[BUA-001, BUA-002] production PayOS adapter sends only the server catalog amount', async () => {
  const plan = findPayosPlan('personal-monthly');
  assert.ok(plan);
  let requestBody: Record<string, unknown> | undefined;
  const adapter = new PayosPaymentLinkAdapter({
    clientId: 'client',
    apiKey: 'api',
    checksumKey: 'checksum',
    successUrl: 'https://web.example/vi-VN/billing/success',
    failedUrl: 'https://web.example/vi-VN/billing/failed',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ code: '00', data: { checkoutUrl: 'https://payos.example/checkout/1' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  const result = await adapter.create(plan, 123456);
  assert.equal(result.orderCode, 123456);
  assert.equal(requestBody?.['amount'], 149_000);
  assert.equal(requestBody?.['orderCode'], 123456);
});

void test('[BUA-007] production PayOS webhook verifies canonical signature and rejects tampering', () => {
  const checksumKey = 'checksum';
  const data = {
    orderCode: 123456,
    amount: 149_000,
    code: '00',
    reference: 'provider-event-1',
    currency: 'VND',
  };
  const canonical = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key as keyof typeof data]}`)
    .join('&');
  const signature = createHmac('sha256', checksumKey).update(canonical).digest('hex');
  const adapter = new PayosPaymentLinkAdapter({
    clientId: 'client',
    apiKey: 'api',
    checksumKey,
    successUrl: 'https://web.example/success',
    failedUrl: 'https://web.example/failed',
  });
  const verified = adapter.verifyWebhook({ code: '00', success: true, signature, data });
  assert.deepEqual(verified, {
    providerEventId: 'provider-event-1',
    orderCode: 123456,
    amountVnd: 149_000,
    status: 'PAID',
  });
  assert.throws(
    () =>
      adapter.verifyWebhook({ code: '00', success: true, signature, data: { ...data, amount: 1 } }),
    /PAYOS_SIGNATURE_INVALID/,
  );
});

void test('[BUA-002] local mock checkout stays on the configured web origin', async () => {
  const adapter = new MockPayosPaymentLinkAdapter({ checkoutBaseUrl: 'https://localhost:8443' });
  const result = await adapter.create(findPayosPlan('team-annual')!, 987654);
  assert.equal(result.checkoutUrl, 'https://localhost:8443/vi-VN/billing/mock-checkout/987654');
  assert.throws(
    () => new MockPayosPaymentLinkAdapter({ checkoutBaseUrl: 'https://localhost:8443/web' }),
    /PAYOS_MOCK_CHECKOUT_ORIGIN_INVALID/,
  );
});
