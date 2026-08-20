import { describe, expect, it } from 'vitest';

import { createBillingApi } from '../src/features/billing/billing-api.ts';

const orderId = '00000000-0000-4000-8000-000000000001';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') throw new Error('expected a JSON request body');
  return body;
}

describe('billing API transport', () => {
  it('reads the server-owned catalog and keeps credentials on the shared transport', async () => {
    const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
    const api = createBillingApi({
      baseUrl: 'http://localhost',
      fetcher: async (input, init) => {
        calls.push({ url: requestUrl(input), init });
        return new Response(
          JSON.stringify({
            schemaVersion: 4,
            plans: [
              {
                id: 'personal-monthly',
                family: 'personal',
                billingCycle: 'monthly',
                amountVnd: 149000,
                description: 'DataBreeze Ca nhan thang',
                displayNameVi: 'Cá nhân',
                displayNameEn: 'Personal',
                taglineVi: 'Cho người vận hành độc lập',
                taglineEn: 'For individual operators',
                benefitsVi: ['Thư mục không giới hạn'],
                benefitsEn: ['Unlimited approved folders'],
                allowances: {
                  connectedFolders: 'unlimited',
                  ocrPagesPerMonth: 200,
                  agentCreditsPerMonth: 1000,
                  etlRowsPerMonth: 5000000,
                  logicalDatasets: 20,
                  governedStorageGb: 10,
                  agentEnabledMembers: 1,
                  viewerMembers: 2,
                  workspaces: 1,
                  refreshMinutes: 60,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const plans = await api.listPlans();
    expect(plans[0]?.amountVnd).toBe(149000);
    expect(calls[0]?.init?.credentials).toBe('include');
  });

  it('sends only a plan id plus an idempotency key and validates checkout/status responses', async () => {
    const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
    const api = createBillingApi({
      baseUrl: 'http://localhost',
      fetcher: async (input, init) => {
        calls.push({ url: requestUrl(input), init });
        const body = typeof init?.body === 'string' ? init.body : '';
        if (body.includes('planId')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 4,
              paymentOrderId: orderId,
              orderCode: 123,
              planId: 'personal-monthly',
              amountVnd: 149000,
              currency: 'VND',
              status: 'PENDING',
              checkoutUrl: 'https://payos.local/mock-checkout/123',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            schemaVersion: 4,
            paymentOrderId: orderId,
            orderCode: 123,
            planId: 'personal-monthly',
            amountVnd: 149000,
            currency: 'VND',
            status: 'PAID',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const checkout = await api.createCheckout('personal-monthly');
    const status = await api.getStatus(123);
    expect(checkout.amountVnd).toBe(149000);
    expect(status.status).toBe('PAID');
    expect(calls[0]?.init?.headers).toBeDefined();
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('idempotency-key')).toBeTruthy();
    expect(JSON.parse(requestBody(calls[0]?.init?.body))).toEqual({
      schemaVersion: 4,
      planId: 'personal-monthly',
    });
  });
});
