import {
  parseV4Contract,
  type BuaPayosCheckoutSession,
  type BuaPayosPaymentStatus,
  type BuaPayosPlanCatalog,
  type ContractV4SchemaId,
} from '@databreeze/contracts/v4';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';
import { localMockPaymentsEnabled } from './billing-config.ts';

const PLAN_CATALOG_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/bua-payos-plan-catalog' as const;
const CHECKOUT_SESSION_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/bua-payos-checkout-session' as const;
const PAYMENT_STATUS_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/bua-payos-payment-status' as const;

export type BillingPlan = BuaPayosPlanCatalog['plans'][number];

const LOCAL_FALLBACK_PLANS: readonly BillingPlan[] = [
  {
    id: 'personal-monthly',
    family: 'personal',
    billingCycle: 'monthly',
    amountVnd: 149_000,
    description: 'DataBreeze Ca nhan thang',
    displayNameVi: 'Cá nhân',
    displayNameEn: 'Personal',
    taglineVi: 'Cho cửa hàng nhỏ và người vận hành độc lập',
    taglineEn: 'For individual operators and small stores',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '20 tập dữ liệu và 10 GB lưu trữ',
      'Đầy đủ Web, Desktop và Android',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '20 datasets and 10 GB storage',
      'Web, Desktop and Android included',
    ],
    allowances: {
      connectedFolders: 'unlimited',
      ocrPagesPerMonth: 200,
      agentCreditsPerMonth: 1_000,
      etlRowsPerMonth: 5_000_000,
      logicalDatasets: 20,
      governedStorageGb: 10,
      agentEnabledMembers: 1,
      viewerMembers: 2,
      workspaces: 1,
      refreshMinutes: 60,
    },
  },
  {
    id: 'professional-monthly',
    family: 'professional',
    billingCycle: 'monthly',
    amountVnd: 399_000,
    description: 'DataBreeze Pro thang',
    displayNameVi: 'Chuyên nghiệp',
    displayNameEn: 'Professional',
    taglineVi: 'Cho nhóm vận hành cần kiểm soát dữ liệu',
    taglineEn: 'For small operating teams',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '100 tập dữ liệu và 50 GB lưu trữ',
      '3 workspace và 10 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '100 datasets and 50 GB storage',
      '3 workspaces and 10 Viewer members',
    ],
    allowances: {
      connectedFolders: 'unlimited',
      ocrPagesPerMonth: 500,
      agentCreditsPerMonth: 4_000,
      etlRowsPerMonth: 25_000_000,
      logicalDatasets: 100,
      governedStorageGb: 50,
      agentEnabledMembers: 3,
      viewerMembers: 10,
      workspaces: 3,
      refreshMinutes: 15,
    },
  },
  {
    id: 'team-monthly',
    family: 'team',
    billingCycle: 'monthly',
    amountVnd: 999_000,
    description: 'DataBreeze Team thang',
    displayNameVi: 'Nhóm',
    displayNameEn: 'Team',
    taglineVi: 'Cho tổ chức đang phát triển',
    taglineEn: 'For growing organizations',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '500 tập dữ liệu và 250 GB lưu trữ',
      '10 workspace và 50 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '500 datasets and 250 GB storage',
      '10 workspaces and 50 Viewer members',
    ],
    allowances: {
      connectedFolders: 'unlimited',
      ocrPagesPerMonth: 1_500,
      agentCreditsPerMonth: 12_000,
      etlRowsPerMonth: 100_000_000,
      logicalDatasets: 500,
      governedStorageGb: 250,
      agentEnabledMembers: 8,
      viewerMembers: 50,
      workspaces: 10,
      refreshMinutes: 5,
    },
  },
];

export class BillingApiError extends Error {
  public constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'BillingApiError';
  }
}

export interface BillingApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

/**
 * The local PayOS adapter is a server-backed payment flow, not presentation
 * demo data. Keep its QA route available when HMR is using the real local
 * database (where VITE_DATABREEZE_DEMO_MODE is intentionally false), while
 * requiring an explicit build-time local flag so production cannot expose it.
 */
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
      try {
        const payload = parseOrThrow<BuaPayosPlanCatalog>(
          PLAN_CATALOG_SCHEMA,
          await request('/v1/billing/payos/plans'),
        );
        return payload.plans;
      } catch {
        return LOCAL_FALLBACK_PLANS;
      }
    },
    async createCheckout(planId: BillingPlan['id']): Promise<BuaPayosCheckoutSession> {
      const random = new Uint32Array(4);
      globalThis.crypto?.getRandomValues?.(random);
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ?? `billing-${Date.now()}-${[...random].join('-')}`;
      return parseOrThrow<BuaPayosCheckoutSession>(
        CHECKOUT_SESSION_SCHEMA,
        await request('/v1/billing/payos/checkout-sessions', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({ schemaVersion: 4, planId }),
        }),
      );
    },
    async getStatus(orderCode: number): Promise<BuaPayosPaymentStatus> {
      if (!Number.isSafeInteger(orderCode) || orderCode < 1)
        throw new BillingApiError('BILLING_ORDER_INVALID');
      return parseOrThrow<BuaPayosPaymentStatus>(
        PAYMENT_STATUS_SCHEMA,
        await request(`/v1/billing/payos/sessions/${encodeURIComponent(String(orderCode))}`),
      );
    },
    /** Local-only QA action. The amount is read from the server status, never from the UI. */
    async simulateMockWebhook(
      orderCode: number,
      status: 'PAID' | 'CANCELLED' | 'FAILED',
    ): Promise<BuaPayosPaymentStatus> {
      if (!localMockPaymentsEnabled()) throw new BillingApiError('MOCK_PAYOS_DISABLED');
      if (!Number.isSafeInteger(orderCode) || orderCode < 1)
        throw new BillingApiError('BILLING_ORDER_INVALID');
      const current = await this.getStatus(orderCode);
      return parseOrThrow<BuaPayosPaymentStatus>(
        PAYMENT_STATUS_SCHEMA,
        await request('/v1/billing/payos/webhook', {
          method: 'POST',
          headers: { Accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({
            eventId: globalThis.crypto?.randomUUID?.() ?? `mock-payos-${Date.now()}`,
            orderCode,
            amountVnd: current.amountVnd,
            status,
          }),
        }),
      );
    },
  });
}

export type BillingApi = ReturnType<typeof createBillingApi>;
