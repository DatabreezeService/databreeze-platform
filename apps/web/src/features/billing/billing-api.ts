import {
  parseV4Contract,
  type BuaPayosCheckoutSession,
  type BuaPayosPaymentStatus,
  type BuaPayosPlanCatalog,
  type ContractV4SchemaId,
} from '@databreeze/contracts/v4';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const PLAN_CATALOG_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/bua-payos-plan-catalog' as const;
const CHECKOUT_SESSION_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/bua-payos-checkout-session' as const;
const PAYMENT_STATUS_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/bua-payos-payment-status' as const;

export type BillingPlan = BuaPayosPlanCatalog['plans'][number];

export class BillingApiError extends Error {
  public constructor(readonly code: string, readonly status?: number) {
    super(code);
    this.name = 'BillingApiError';
  }
}

export interface BillingApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function parseOrThrow<TValue>(schema: ContractV4SchemaId, payload: unknown): TValue {
  const parsed = parseV4Contract<TValue>(schema, payload);
  if (!parsed.accepted) throw new BillingApiError('BILLING_RESPONSE_INVALID');
  return parsed.value;
}

async function responsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  return response.json().catch(() => undefined);
}

export function createBillingApi(options: BillingApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, init);
    } catch {
      throw new BillingApiError('BILLING_REQUEST_FAILED');
    }
    const payload = await responsePayload(response);
    if (!response.ok) {
      const body = payload as { readonly code?: unknown } | undefined;
      throw new BillingApiError(
        typeof body?.code === 'string' ? body.code : 'BILLING_REQUEST_FAILED',
        response.status,
      );
    }
    return payload;
  }
  return Object.freeze({
    async listPlans(): Promise<readonly BillingPlan[]> {
      const payload = parseOrThrow<BuaPayosPlanCatalog>(PLAN_CATALOG_SCHEMA, await request('/v1/billing/payos/plans'));
      return payload.plans;
    },
    async createCheckout(planId: BillingPlan['id']): Promise<BuaPayosCheckoutSession> {
      const random = new Uint32Array(4);
      globalThis.crypto?.getRandomValues?.(random);
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `billing-${Date.now()}-${[...random].join('-')}`;
      return parseOrThrow<BuaPayosCheckoutSession>(CHECKOUT_SESSION_SCHEMA, await request('/v1/billing/payos/checkout-sessions', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ schemaVersion: 4, planId }),
      }));
    },
    async getStatus(orderCode: number): Promise<BuaPayosPaymentStatus> {
      if (!Number.isSafeInteger(orderCode) || orderCode < 1) throw new BillingApiError('BILLING_ORDER_INVALID');
      return parseOrThrow<BuaPayosPaymentStatus>(PAYMENT_STATUS_SCHEMA, await request(`/v1/billing/payos/sessions/${encodeURIComponent(String(orderCode))}`));
    },
    /** Local-only QA action. The amount is read from the server status, never from the UI. */
    async simulateMockWebhook(orderCode: number, status: 'PAID' | 'CANCELLED' | 'FAILED'): Promise<BuaPayosPaymentStatus> {
      if (import.meta.env['VITE_DATABREEZE_DEMO_MODE'] !== 'true') throw new BillingApiError('MOCK_PAYOS_DISABLED');
      if (!Number.isSafeInteger(orderCode) || orderCode < 1) throw new BillingApiError('BILLING_ORDER_INVALID');
      const current = await this.getStatus(orderCode);
      return parseOrThrow<BuaPayosPaymentStatus>(PAYMENT_STATUS_SCHEMA, await request('/v1/billing/payos/webhook', {
        method: 'POST',
        headers: { Accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: globalThis.crypto?.randomUUID?.() ?? `mock-payos-${Date.now()}`,
          orderCode,
          amountVnd: current.amountVnd,
          status,
        }),
      }));
    },
  });
}

export type BillingApi = ReturnType<typeof createBillingApi>;
