import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PayosPaymentLinkAdapter } from '../adapter/payos-payment-link.adapter.js';
import { findPayosPlan, listPayosPlans, type PayosPlanId } from './payos-plan-catalog.js';

export type PayosPaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED';
export interface PayosPaymentSession {
  readonly orderCode: number;
  readonly planId: PayosPlanId;
  readonly amountVnd: number;
  readonly status: PayosPaymentStatus;
  readonly checkoutUrl: string;
}

export class PayosPaymentService {
  private readonly sessions = new Map<number, PayosPaymentSession>();
  public constructor(
    private readonly adapter: Pick<PayosPaymentLinkAdapter, 'create'>,
    private readonly checksumKey: string,
  ) {}

  public plans() {
    return listPayosPlans();
  }

  public async create(planId: unknown): Promise<PayosPaymentSession> {
    const plan = findPayosPlan(planId);
    if (plan === undefined) throw new Error('PAYOS_PLAN_NOT_FOUND');
    const link = await this.adapter.create(plan);
    const session = Object.freeze({
      orderCode: link.orderCode,
      planId: plan.id,
      amountVnd: plan.amountVnd,
      status: 'PENDING' as const,
      checkoutUrl: link.checkoutUrl,
    });
    this.sessions.set(session.orderCode, session);
    return session;
  }

  public status(orderCode: number): PayosPaymentSession | undefined {
    return this.sessions.get(orderCode);
  }

  public applyWebhook(input: { readonly orderCode: number; readonly status: string; readonly signature: string }): PayosPaymentSession {
    const current = this.sessions.get(input.orderCode);
    if (current === undefined) throw new Error('PAYOS_ORDER_NOT_FOUND');
    const normalized = input.status === 'PAID' ? 'PAID' : input.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
    const expected = createHmac('sha256', this.checksumKey).update(`orderCode=${input.orderCode}&status=${normalized}`).digest('hex');
    const actual = Buffer.from(input.signature, 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) throw new Error('PAYOS_SIGNATURE_INVALID');
    const next = Object.freeze({ ...current, status: normalized as PayosPaymentStatus });
    this.sessions.set(input.orderCode, next);
    return next;
  }
}
