import { createHmac } from 'node:crypto';

import type { PayosPlanV1 } from '../application/payos-plan-catalog.js';

export interface PayosPaymentLinkAdapterOptions {
  readonly clientId: string;
  readonly apiKey: string;
  readonly checksumKey: string;
  readonly successUrl: string;
  readonly failedUrl: string;
  readonly endpointUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface PayosCheckoutLinkV1 {
  readonly checkoutUrl: string;
  readonly orderCode: number;
}

/** Minimal PayOS v2 hosted-payment adapter. It never receives a client amount. */
export class PayosPaymentLinkAdapter {
  private readonly endpointUrl: string;
  private readonly request: typeof globalThis.fetch;
  private lastOrderCode = 0;

  constructor(private readonly options: PayosPaymentLinkAdapterOptions) {
    this.endpointUrl = options.endpointUrl ?? 'https://api-merchant.payos.vn';
    this.request = options.fetch ?? globalThis.fetch;
  }

  async create(plan: PayosPlanV1): Promise<PayosCheckoutLinkV1> {
    const orderCode = this.nextOrderCode();
    const returnUrl = this.options.successUrl;
    const cancelUrl = this.options.failedUrl;
    const signatureData = `amount=${plan.amountVnd}&cancelUrl=${cancelUrl}&description=${plan.description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const signature = createHmac('sha256', this.options.checksumKey).update(signatureData).digest('hex');
    const response = await this.request(`${this.endpointUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-id': this.options.clientId, 'x-api-key': this.options.apiKey },
      body: JSON.stringify({ orderCode, amount: plan.amountVnd, description: plan.description, returnUrl, cancelUrl, signature }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const checkoutUrl = body !== null && typeof body === 'object' ? (body as { data?: { checkoutUrl?: unknown } }).data?.checkoutUrl : undefined;
    if (!response.ok || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://'))
      throw new Error('PAYOS_CHECKOUT_UNAVAILABLE');
    return Object.freeze({ checkoutUrl, orderCode });
  }

  private nextOrderCode(): number {
    const candidate = Date.now();
    this.lastOrderCode = Math.max(candidate, this.lastOrderCode + 1);
    return this.lastOrderCode;
  }
}
