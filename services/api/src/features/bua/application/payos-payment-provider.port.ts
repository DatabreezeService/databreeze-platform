import type { PayosPlanV1 } from './payos-plan-catalog.js';

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
