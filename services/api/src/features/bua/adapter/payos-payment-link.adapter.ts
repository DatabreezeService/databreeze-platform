import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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

export interface PayosWebhookVerificationV1 {
  readonly providerEventId: string;
  readonly orderCode: number;
  readonly amountVnd: number;
  readonly status: 'PAID' | 'CANCELLED' | 'FAILED';
}

export interface PayosPaymentProviderPortV1 {
  create(plan: PayosPlanV1, orderCode: number): Promise<PayosCheckoutLinkV1>;
  verifyWebhook(payload: unknown): PayosWebhookVerificationV1;
}

/** Production PayOS v2 adapter. It never trusts a client amount or a redirect query string. */
export class PayosPaymentLinkAdapter implements PayosPaymentProviderPortV1 {
  private readonly endpointUrl: string;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: PayosPaymentLinkAdapterOptions) {
    this.endpointUrl = options.endpointUrl ?? 'https://api-merchant.payos.vn';
    this.request = options.fetch ?? globalThis.fetch;
  }

  async create(plan: PayosPlanV1, orderCode: number): Promise<PayosCheckoutLinkV1> {
    const returnUrl = this.options.successUrl;
    const cancelUrl = this.options.failedUrl;
    const signatureData = `amount=${plan.amountVnd}&cancelUrl=${cancelUrl}&description=${plan.description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const signature = createHmac('sha256', this.options.checksumKey)
      .update(signatureData)
      .digest('hex');
    const response = await this.request(`${this.endpointUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': this.options.clientId,
        'x-api-key': this.options.apiKey,
      },
      body: JSON.stringify({
        orderCode,
        amount: plan.amountVnd,
        description: plan.description,
        returnUrl,
        cancelUrl,
        signature,
      }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const checkoutUrl =
      body !== null && typeof body === 'object'
        ? (body as { data?: { checkoutUrl?: unknown } }).data?.checkoutUrl
        : undefined;
    if (!response.ok || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://'))
      throw new Error('PAYOS_CHECKOUT_UNAVAILABLE');
    return Object.freeze({ checkoutUrl, orderCode });
  }

  verifyWebhook(payload: unknown): PayosWebhookVerificationV1 {
    if (payload === null || typeof payload !== 'object') throw new Error('PAYOS_WEBHOOK_INVALID');
    const envelope = payload as Record<string, unknown>;
    const data = envelope['data'];
    const signature = envelope['signature'];
    if (data === null || typeof data !== 'object' || typeof signature !== 'string')
      throw new Error('PAYOS_WEBHOOK_INVALID');
    const values = data as Record<string, unknown>;
    const orderCode = values['orderCode'];
    const amount = values['amount'];
    if (
      typeof orderCode !== 'number' ||
      !Number.isSafeInteger(orderCode) ||
      orderCode < 1 ||
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount < 1
    )
      throw new Error('PAYOS_WEBHOOK_INVALID');
    const canonical = Object.keys(values)
      .sort()
      .map((key) => `${key}=${values[key] === null || values[key] === undefined ? '' : String(values[key])}`)
      .join('&');
    const expected = createHmac('sha256', this.options.checksumKey).update(canonical).digest('hex');
    const actual = Buffer.from(signature, 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes))
      throw new Error('PAYOS_SIGNATURE_INVALID');
    const topCode = envelope['code'];
    const dataCode = values['code'];
    const status =
      envelope['success'] === true && (topCode === '00' || dataCode === '00')
        ? 'PAID'
        : values['canceledAt'] !== undefined
          ? 'CANCELLED'
          : 'FAILED';
    const providerEventId =
      typeof values['reference'] === 'string' && values['reference'].length > 0
        ? values['reference']
        : typeof values['paymentLinkId'] === 'string' && values['paymentLinkId'].length > 0
          ? values['paymentLinkId']
          : createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return Object.freeze({
      providerEventId,
      orderCode,
      amountVnd: amount,
      status,
    });
  }
}

/** Deterministic local adapter. It has no provider credentials and is opt-in for tests only. */
export class MockPayosPaymentLinkAdapter implements PayosPaymentProviderPortV1 {
  async create(_plan: PayosPlanV1, orderCode: number): Promise<PayosCheckoutLinkV1> {
    return Object.freeze({
      checkoutUrl: `https://payos.local/mock-checkout/${orderCode}`,
      orderCode,
    });
  }

  verifyWebhook(payload: unknown): PayosWebhookVerificationV1 {
    if (payload === null || typeof payload !== 'object') throw new Error('PAYOS_WEBHOOK_INVALID');
    const input = payload as Record<string, unknown>;
    if (
      typeof input['orderCode'] !== 'number' ||
      !Number.isSafeInteger(input['orderCode']) ||
      typeof input['amountVnd'] !== 'number' ||
      !Number.isSafeInteger(input['amountVnd']) ||
      typeof input['status'] !== 'string' ||
      !['PAID', 'CANCELLED', 'FAILED'].includes(input['status'])
    )
      throw new Error('PAYOS_WEBHOOK_INVALID');
    const eventId = input['eventId'];
    if (typeof eventId !== 'string' || eventId.length === 0) throw new Error('PAYOS_WEBHOOK_INVALID');
    return Object.freeze({
      providerEventId: eventId,
      orderCode: input['orderCode'],
      amountVnd: input['amountVnd'],
      status: input['status'] as PayosWebhookVerificationV1['status'],
    });
  }
}
