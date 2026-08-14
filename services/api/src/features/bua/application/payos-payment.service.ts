import { randomInt, randomUUID } from 'node:crypto';

import {
  createEntitlementSnapshotV1,
  createPlanV1,
  type EntitlementQuotaV1,
} from '@databreeze/domain/entitlements/v1';
import {
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { PermissionV1 } from '@databreeze/domain/permissions/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  PayosPaymentProviderPortV1,
  PayosWebhookVerificationV1,
} from '../adapter/payos-payment-link.adapter.js';
import {
  findPayosPlan,
  listPayosPlans,
  type PayosPlanId,
  type PayosPlanV1,
} from './payos-plan-catalog.js';

export type PayosPaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED';

export interface PayosPaymentSession {
  readonly schemaVersion: 4;
  readonly paymentOrderId: string;
  readonly orderCode: number;
  readonly planId: PayosPlanId;
  readonly amountVnd: number;
  readonly currency: 'VND';
  readonly status: PayosPaymentStatus;
  readonly checkoutUrl?: string;
}

export interface PaymentOrderDatabaseRowV1 {
  readonly id: string;
  readonly provider: string;
  readonly providerOrderCode: bigint | number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly actorId: string;
  readonly securityEpoch: number;
  readonly planId: string;
  readonly amountVnd: number;
  readonly currency: string;
  readonly status: string;
  readonly checkoutUrl: string | null;
  readonly idempotencyKey: string;
  readonly failureCode: string | null;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly revision: number;
}

export interface PaymentWebhookInboxDatabaseRowV1 {
  readonly id: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly providerOrderCode: bigint | number | null;
  readonly amountVnd: number | null;
  readonly statusFromProvider: string | null;
  readonly signature: string;
  readonly payload: unknown;
  readonly state: string;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
}

interface DelegateV1<TRow> {
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<TRow>;
  findUnique(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<TRow | null>;
  update(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<TRow>;
}

interface UpsertDelegateV1<TRow> extends DelegateV1<TRow> {
  upsert(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly create: Readonly<Record<string, unknown>>;
    readonly update: Readonly<Record<string, unknown>>;
  }): Promise<TRow>;
}

export interface PaymentDatabaseClientV1 {
  readonly paymentOrderRecord: DelegateV1<PaymentOrderDatabaseRowV1>;
  readonly paymentWebhookInboxRecord: DelegateV1<PaymentWebhookInboxDatabaseRowV1>;
  readonly subscriptionRecord: UpsertDelegateV1<Record<string, unknown>>;
  readonly invoiceRecord: DelegateV1<Record<string, unknown>>;
  readonly paymentAuditEventRecord: DelegateV1<Record<string, unknown>>;
  readonly entitlementPlanRecord: DelegateV1<Record<string, unknown>>;
  readonly entitlementSnapshotRecord: DelegateV1<Record<string, unknown>>;
  $transaction<TValue>(work: (transaction: PaymentDatabaseClientV1) => Promise<TValue>): Promise<TValue>;
}

export interface BillingAuthorizationPortV1 {
  authorize(input: {
    readonly context: IamTenantContextV1;
    readonly permission: PermissionV1;
  }): Promise<{ readonly allowed: boolean }>;
}

export const PAYOS_PAYMENT_SERVICE = Symbol('PAYOS_PAYMENT_SERVICE');

export type PayosPaymentErrorCodeV1 =
  | 'PAYOS_REQUEST_INVALID'
  | 'PAYOS_PLAN_NOT_FOUND'
  | 'PAYOS_ORDER_NOT_FOUND'
  | 'PAYOS_SCOPE_MISMATCH'
  | 'PAYOS_IDEMPOTENCY_CONFLICT'
  | 'PAYOS_CHECKOUT_UNAVAILABLE'
  | 'PAYOS_WEBHOOK_INVALID'
  | 'PAYOS_SIGNATURE_INVALID'
  | 'PAYOS_AMOUNT_MISMATCH'
  | 'PAYOS_UNAUTHORIZED'
  | 'PAYOS_UNAVAILABLE';

export class PayosPaymentProblemError extends Error {
  public constructor(readonly code: PayosPaymentErrorCodeV1) {
    super(code);
    this.name = 'PayosPaymentProblemError';
  }
}

function integerOrderCode(value: bigint | number): number {
  const normalized = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1) throw new PayosPaymentProblemError('PAYOS_ORDER_NOT_FOUND');
  return normalized;
}

function scopeIsBillable(scope: TenantScopeV1): boolean {
  return scope.scopeType === 'organization' || scope.scopeType === 'workspace';
}

function planQuotas(plan: PayosPlanV1): readonly EntitlementQuotaV1[] {
  return Object.freeze([
    { metric: 'artifact_bytes', limit: plan.id.startsWith('team-') ? 500_000_000_000 : plan.id.startsWith('professional-') ? 100_000_000_000 : 10_000_000_000 },
    { metric: 'ocr_pages', limit: plan.id.startsWith('team-') ? 200_000 : plan.id.startsWith('professional-') ? 50_000 : 5_000 },
    { metric: 'job_count', limit: plan.id.startsWith('team-') ? 100_000 : plan.id.startsWith('professional-') ? 25_000 : 5_000 },
  ] as EntitlementQuotaV1[]);
}

function planFeatures(plan: PayosPlanV1): readonly string[] {
  return Object.freeze([
    'workspace.dashboard.read',
    'dataset.capture',
    'dataset.analysis',
    ...(plan.id.startsWith('professional-') || plan.id.startsWith('team-') ? ['workspace.members.manage'] : []),
    ...(plan.id.startsWith('team-') ? ['support.priority'] : []),
  ]);
}

function paidPlan(plan: PayosPlanV1) {
  const created = createPlanV1({
    planCode: plan.id,
    displayNameKey: `plan.${plan.id}`,
    features: planFeatures(plan),
    quotas: planQuotas(plan),
  });
  if (!created.accepted) throw new PayosPaymentProblemError('PAYOS_PLAN_NOT_FOUND');
  return created.value;
}

function nextStatus(current: PayosPaymentStatus, incoming: PayosPaymentStatus): PayosPaymentStatus {
  if (current === 'PAID') return 'PAID';
  if (current === 'CANCELLED' || current === 'FAILED') return current;
  return incoming;
}

/** Durable BUA payment application service. External provider calls happen outside DB settlement. */
export class PayosPaymentService {
  public constructor(
    private readonly database: PaymentDatabaseClientV1,
    private readonly provider: PayosPaymentProviderPortV1,
    private readonly authorization: BillingAuthorizationPortV1,
    private readonly now: () => Date = () => new Date(),
    private readonly orderCodeGenerator: () => number = () => Date.now() * 1_000 + randomInt(0, 1_000),
  ) {}

  public async plans(context: IamTenantContextV1) {
    await this.require(context, 'billing.account.read');
    return Object.freeze({ schemaVersion: 4 as const, plans: listPayosPlans() });
  }

  public async create(context: IamTenantContextV1, planId: unknown): Promise<PayosPaymentSession> {
    if (!scopeIsBillable(context.tenantScope)) throw new PayosPaymentProblemError('PAYOS_SCOPE_MISMATCH');
    await this.require(context, 'billing.account.manage');
    const plan = findPayosPlan(planId);
    if (plan === undefined) throw new PayosPaymentProblemError('PAYOS_PLAN_NOT_FOUND');
    const scopeKey = tenantScopeKeyV1(context.tenantScope);
    const existing = await this.database.paymentOrderRecord.findUnique({
      where: { scopeKey_idempotencyKey: { scopeKey, idempotencyKey: context.idempotencyKey } },
    });
    if (existing) {
      if (existing.planId !== plan.id || existing.amountVnd !== plan.amountVnd)
        throw new PayosPaymentProblemError('PAYOS_IDEMPOTENCY_CONFLICT');
      return this.session(existing);
    }
    const orderCode = this.orderCodeGenerator();
    if (!Number.isSafeInteger(orderCode) || orderCode < 1) throw new PayosPaymentProblemError('PAYOS_UNAVAILABLE');
    const created = await this.database.paymentOrderRecord.create({
      data: {
        id: randomUUID(),
        provider: 'PAYOS',
        providerOrderCode: BigInt(orderCode),
        scopeKey,
        scopeType: context.tenantScope.scopeType,
        organizationId: context.tenantScope.organizationId,
        workspaceId: context.tenantScope.scopeType === 'organization' ? null : context.tenantScope.workspaceId,
        actorId: context.actorId,
        securityEpoch: context.authorizationEpoch,
        planId: plan.id,
        amountVnd: plan.amountVnd,
        currency: 'VND',
        status: 'PENDING',
        checkoutUrl: null,
        idempotencyKey: context.idempotencyKey,
        failureCode: null,
        paidAt: null,
        cancelledAt: null,
        revision: 1,
      },
    });
    try {
      const link = await this.provider.create(plan, orderCode);
      const updated = await this.database.paymentOrderRecord.update({
        where: { id: created.id },
        data: { checkoutUrl: link.checkoutUrl, updatedAt: this.now(), revision: created.revision + 1 },
      });
      return this.session(updated);
    } catch {
      await this.database.paymentOrderRecord.update({
        where: { id: created.id },
        data: { status: 'FAILED', failureCode: 'PAYOS_CHECKOUT_UNAVAILABLE', updatedAt: this.now(), revision: created.revision + 1 },
      }).catch(() => undefined);
      throw new PayosPaymentProblemError('PAYOS_CHECKOUT_UNAVAILABLE');
    }
  }

  public async status(context: IamTenantContextV1, orderCodeInput: number): Promise<PayosPaymentSession> {
    await this.require(context, 'billing.account.read');
    const orderCode = integerOrderCode(orderCodeInput);
    const row = await this.database.paymentOrderRecord.findUnique({
      where: { provider_providerOrderCode: { provider: 'PAYOS', providerOrderCode: BigInt(orderCode) } },
    });
    if (!row) throw new PayosPaymentProblemError('PAYOS_ORDER_NOT_FOUND');
    if (row.scopeKey !== tenantScopeKeyV1(context.tenantScope)) throw new PayosPaymentProblemError('PAYOS_SCOPE_MISMATCH');
    return this.session(row);
  }

  public async applyWebhook(payload: unknown): Promise<PayosPaymentSession> {
    let verified: PayosWebhookVerificationV1;
    try {
      verified = this.provider.verifyWebhook(payload);
    } catch (error) {
      if (error instanceof Error && error.message === 'PAYOS_SIGNATURE_INVALID')
        throw new PayosPaymentProblemError('PAYOS_SIGNATURE_INVALID');
      throw new PayosPaymentProblemError('PAYOS_WEBHOOK_INVALID');
    }
    const envelope = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const signature = typeof envelope['signature'] === 'string' ? envelope['signature'] : `mock:${verified.providerEventId}`;
    const result = await this.database.$transaction(async (transaction) => {
      const existingInbox = await transaction.paymentWebhookInboxRecord.findUnique({
        where: { provider_providerEventId: { provider: 'PAYOS', providerEventId: verified.providerEventId } },
      });
      if (existingInbox) {
        if (
          existingInbox.amountVnd !== verified.amountVnd ||
          existingInbox.statusFromProvider !== verified.status
        ) {
          throw new PayosPaymentProblemError('PAYOS_WEBHOOK_INVALID');
        }
        const row = await transaction.paymentOrderRecord.findUnique({
          where: { provider_providerOrderCode: { provider: 'PAYOS', providerOrderCode: BigInt(verified.orderCode) } },
        });
        if (!row) return { error: 'PAYOS_ORDER_NOT_FOUND' as const };
        return { row };
      }
      const inbox = await transaction.paymentWebhookInboxRecord.create({
        data: {
          id: randomUUID(), provider: 'PAYOS', providerEventId: verified.providerEventId,
          providerOrderCode: BigInt(verified.orderCode), amountVnd: verified.amountVnd,
          statusFromProvider: verified.status, signature, payload, state: 'RECEIVED', attemptCount: 1,
          lastError: null, receivedAt: this.now(), processedAt: null,
        },
      });
      const row = await transaction.paymentOrderRecord.findUnique({
        where: { provider_providerOrderCode: { provider: 'PAYOS', providerOrderCode: BigInt(verified.orderCode) } },
      });
      if (!row) {
        await transaction.paymentWebhookInboxRecord.update({ where: { id: inbox.id }, data: { state: 'REJECTED', lastError: 'PAYOS_ORDER_NOT_FOUND', processedAt: this.now() } });
        return { error: 'PAYOS_ORDER_NOT_FOUND' as const };
      }
      if (row.amountVnd !== verified.amountVnd) {
        await transaction.paymentWebhookInboxRecord.update({ where: { id: inbox.id }, data: { state: 'REJECTED', lastError: 'PAYOS_AMOUNT_MISMATCH', processedAt: this.now() } });
        return { error: 'PAYOS_AMOUNT_MISMATCH' as const };
      }
      const current = row.status as PayosPaymentStatus;
      const status = nextStatus(current, verified.status);
      const updated = await transaction.paymentOrderRecord.update({
        where: { id: row.id },
        data: {
          status,
          paidAt: status === 'PAID' && row.paidAt === null ? this.now() : row.paidAt,
          cancelledAt: status === 'CANCELLED' && row.cancelledAt === null ? this.now() : row.cancelledAt,
          updatedAt: this.now(), revision: row.revision + 1,
        },
      });
      if (status === 'PAID' && current !== 'PAID') await this.settlePaid(transaction, updated, verified);
      await transaction.paymentWebhookInboxRecord.update({ where: { id: inbox.id }, data: { state: 'PROCESSED', processedAt: this.now() } });
      return { row: updated };
    });
    if ('error' in result) throw new PayosPaymentProblemError(result.error);
    return this.session(result.row);
  }

  private async settlePaid(
    transaction: PaymentDatabaseClientV1,
    order: PaymentOrderDatabaseRowV1,
    verified: PayosWebhookVerificationV1,
  ): Promise<void> {
    const plan = findPayosPlan(order.planId);
    if (!plan) throw new PayosPaymentProblemError('PAYOS_PLAN_NOT_FOUND');
    const scope = {
      scopeType: order.scopeType,
      organizationId: order.organizationId,
      ...(order.workspaceId === null ? {} : { workspaceId: order.workspaceId }),
    } as TenantScopeV1;
    const entitlementPlan = paidPlan(plan);
    const existingPlan = await transaction.entitlementPlanRecord.findUnique({
      where: { planCode: entitlementPlan.planCode },
    });
    if (existingPlan === null) {
      await transaction.entitlementPlanRecord.create({
        data: {
          planCode: entitlementPlan.planCode,
          schemaVersion: 1,
          displayNameKey: entitlementPlan.displayNameKey,
          features: entitlementPlan.features,
          quotas: entitlementPlan.quotas,
          providerIndependent: true,
        },
      });
    }
    const previous = await transaction.entitlementSnapshotRecord.findFirst({ where: { scopeKey: tenantScopeKeyV1(scope) }, orderBy: { revision: 'desc' } });
    const previousRevision = previous?.['revision'];
    const revision = typeof previousRevision === 'number' ? previousRevision + 1 : 1;
    const snapshot = createEntitlementSnapshotV1({
      snapshotId: randomUUID(), tenantScope: scope, plan: entitlementPlan, status: 'ACTIVE',
      revision, securityEpoch: order.securityEpoch, effectiveAt: this.now().toISOString(),
    });
    if (!snapshot.accepted) throw new PayosPaymentProblemError('PAYOS_UNAVAILABLE');
    await transaction.entitlementSnapshotRecord.create({
      data: {
        id: snapshot.value.snapshotId, schemaVersion: 1, scopeKey: tenantScopeKeyV1(scope),
        scopeType: scope.scopeType, organizationId: scope.organizationId,
        workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
        planCode: snapshot.value.planCode, status: snapshot.value.status, revision,
        securityEpoch: order.securityEpoch, effectiveAt: this.now(), expiresAt: null,
        features: snapshot.value.features, quotas: snapshot.value.quotas,
      },
    });
    await transaction.subscriptionRecord.upsert({
      where: { scopeKey: order.scopeKey },
      create: {
        id: randomUUID(), scopeKey: order.scopeKey, scopeType: order.scopeType,
        organizationId: order.organizationId, workspaceId: order.workspaceId,
        planId: plan.id, source: 'PAYOS', status: 'ACTIVE', currentOrderId: order.id,
        startsAt: this.now(), endsAt: null, revision: 1,
      },
      update: { planId: plan.id, source: 'PAYOS', status: 'ACTIVE', currentOrderId: order.id, startsAt: this.now(), revision: { increment: 1 }, updatedAt: this.now() },
    });
    const existingInvoice = await transaction.invoiceRecord.findUnique({
      where: { paymentOrderId: order.id },
    });
    if (existingInvoice === null) {
      await transaction.invoiceRecord.create({
        data: {
          id: randomUUID(), paymentOrderId: order.id, scopeKey: order.scopeKey,
          organizationId: order.organizationId, workspaceId: order.workspaceId,
          planId: plan.id, amountVnd: verified.amountVnd, currency: 'VND', status: 'PAID',
          issuedAt: this.now(), paidAt: this.now(),
        },
      });
    }
    const existingAudit = await transaction.paymentAuditEventRecord.findUnique({
      where: { paymentOrderId_action: { paymentOrderId: order.id, action: 'billing.payment.settled' } },
    });
    if (existingAudit === null) {
      await transaction.paymentAuditEventRecord.create({
        data: {
          id: randomUUID(), paymentOrderId: order.id, scopeKey: order.scopeKey,
          organizationId: order.organizationId, workspaceId: order.workspaceId,
          actorId: order.actorId, action: 'billing.payment.settled',
          payload: { provider: 'PAYOS', orderCode: verified.orderCode, amountVnd: verified.amountVnd, planId: plan.id },
        },
      });
    }
  }

  private async require(context: IamTenantContextV1, permission: PermissionV1): Promise<void> {
    const decision = await this.authorization.authorize({ context, permission });
    if (!decision.allowed) throw new PayosPaymentProblemError('PAYOS_UNAUTHORIZED');
  }

  private session(row: PaymentOrderDatabaseRowV1): PayosPaymentSession {
    const plan = findPayosPlan(row.planId);
    if (!plan || row.currency !== 'VND') throw new PayosPaymentProblemError('PAYOS_UNAVAILABLE');
    return Object.freeze({
      schemaVersion: 4,
      paymentOrderId: row.id,
      orderCode: integerOrderCode(row.providerOrderCode),
      planId: plan.id,
      amountVnd: row.amountVnd,
      currency: 'VND' as const,
      status: row.status as PayosPaymentStatus,
      ...(row.checkoutUrl === null ? {} : { checkoutUrl: row.checkoutUrl }),
    });
  }
}

/** The route remains discoverable in OpenAPI, but fails closed until durable payment composition exists. */
export class UnavailablePayosPaymentService {
  private unavailable(): never {
    throw new PayosPaymentProblemError('PAYOS_UNAVAILABLE');
  }
  public async plans(_context: IamTenantContextV1): Promise<never> { return this.unavailable(); }
  public async create(_context: IamTenantContextV1, _planId: unknown): Promise<never> { return this.unavailable(); }
  public async status(_context: IamTenantContextV1, _orderCode: number): Promise<never> { return this.unavailable(); }
  public async applyWebhook(_payload: unknown): Promise<never> { return this.unavailable(); }
}
