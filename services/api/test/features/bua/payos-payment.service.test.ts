import assert from 'node:assert/strict';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PayosPaymentProblemError,
  PayosPaymentService,
  type PaymentDatabaseClientV1,
} from '../../../src/features/bua/application/payos-payment.service.js';
import { MockPayosPaymentLinkAdapter } from '../../../src/features/bua/adapter/payos-payment-link.adapter.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

type Row = any;

class FakeDatabase {
  readonly orders = new Map<string, Row>();
  readonly inbox = new Map<string, Row>();
  readonly subscriptions = new Map<string, Row>();
  readonly invoices = new Map<string, Row>();
  readonly audits = new Map<string, Row>();
  readonly plans = new Map<string, Row>();
  readonly snapshots = new Map<string, Row>();

  private readonly delegate = (kind: keyof FakeDatabase) => ({
    create: async ({ data }: { readonly data: Row }) => {
      const map = this.map(kind);
      const row = {
        ...data,
        createdAt: data.createdAt ?? new Date(),
        updatedAt: data.updatedAt ?? new Date(),
      };
      const key = this.createKey(kind, row);
      if (map.has(key)) throw new Error('P2002');
      map.set(key, row);
      return row;
    },
    findUnique: async ({ where }: { readonly where: Row }) => this.find(kind, where),
    findFirst: async ({ where, orderBy }: { readonly where: Row; readonly orderBy?: Row }) => {
      const rows = [...this.map(kind).values()].filter((row) => this.matches(row, where));
      if (orderBy?.['revision'] === 'desc')
        rows.sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));
      return rows[0] ?? null;
    },
    update: async ({ where, data }: { readonly where: Row; readonly data: Row }) => {
      const existing = this.find(kind, where);
      if (!existing) throw new Error('P2025');
      const next = { ...existing, ...data, updatedAt: data.updatedAt ?? new Date() };
      if (data.revision && typeof data.revision === 'object' && 'increment' in data.revision)
        next.revision = existing.revision + data.revision.increment;
      this.map(kind).set(this.createKey(kind, next), next);
      return next;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      readonly where: Row;
      readonly create: Row;
      readonly update: Row;
    }) => {
      const existing = this.find(kind, where);
      if (existing) {
        const next = { ...existing, ...update, updatedAt: update.updatedAt ?? new Date() };
        if (
          update.revision &&
          typeof update.revision === 'object' &&
          'increment' in update.revision
        )
          next.revision = existing.revision + update.revision.increment;
        this.map(kind).set(this.createKey(kind, next), next);
        return next;
      }
      const row = {
        ...create,
        createdAt: create.createdAt ?? new Date(),
        updatedAt: create.updatedAt ?? new Date(),
      };
      this.map(kind).set(this.createKey(kind, row), row);
      return row;
    },
  });

  readonly paymentOrderRecord: any = this.delegate('orders');
  readonly paymentWebhookInboxRecord: any = this.delegate('inbox');
  readonly subscriptionRecord: any = this.delegate('subscriptions');
  readonly invoiceRecord: any = this.delegate('invoices');
  readonly paymentAuditEventRecord: any = this.delegate('audits');
  readonly entitlementPlanRecord: any = this.delegate('plans');
  readonly entitlementSnapshotRecord: any = this.delegate('snapshots');

  async $transaction<T>(work: (transaction: PaymentDatabaseClientV1) => Promise<T>): Promise<T> {
    return work(this as unknown as PaymentDatabaseClientV1);
  }

  private map(kind: keyof FakeDatabase): Map<string, Row> {
    return this[kind] as unknown as Map<string, Row>;
  }

  private createKey(kind: keyof FakeDatabase, row: Row): string {
    if (kind === 'orders') return String(row.id);
    if (kind === 'inbox') return String(row.id);
    if (kind === 'subscriptions') return String(row.scopeKey);
    if (kind === 'invoices') return String(row.paymentOrderId);
    if (kind === 'audits') return `${row.paymentOrderId}:${row.action}`;
    if (kind === 'plans') return String(row.planCode);
    return String(row.id);
  }

  private matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key.includes('_')) {
        return Object.entries(value as Row).every(
          ([nestedKey, nestedValue]) => String(row[nestedKey]) === String(nestedValue),
        );
      }
      return String(row[key]) === String(value);
    });
  }

  private find(kind: keyof FakeDatabase, where: Row): Row | null {
    return [...this.map(kind).values()].find((row) => this.matches(row, where)) ?? null;
  }
}

function context(
  idempotencyKey: string,
  scope: { readonly organizationId?: string; readonly workspaceId?: string } = {},
) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: scope.organizationId ?? organizationId,
      workspaceId: scope.workspaceId ?? workspaceId,
    },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 7,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

function service(database: FakeDatabase, allowed = true) {
  let code = 900_000;
  return new PayosPaymentService(
    database as unknown as PaymentDatabaseClientV1,
    new MockPayosPaymentLinkAdapter(),
    { authorize: async () => ({ allowed }) },
    () => new Date('2026-08-14T12:00:00.000Z'),
    () => ++code,
  );
}

void test('[BUA-001, BUA-002, BUA-004] checkout is durable, server-priced, tenant-scoped and idempotent', async () => {
  const database = new FakeDatabase();
  const first = await service(database).create(context('same-key'), 'personal-monthly');
  const second = await service(database).create(context('same-key'), 'personal-monthly');
  const otherScope = await service(database).create(
    context('same-key', { workspaceId: '00000000-0000-4000-8000-000000000003' }),
    'personal-monthly',
  );
  assert.equal(first.paymentOrderId, second.paymentOrderId);
  assert.notEqual(first.paymentOrderId, otherScope.paymentOrderId);
  assert.equal(first.amountVnd, 149_000);
  assert.equal(database.orders.size, 2);
});

void test('[BUA-007, BUA-008, BUA-009, BUA-010] webhook settlement is amount-checked, replay-safe and atomic', async () => {
  const database = new FakeDatabase();
  const payments = service(database);
  const order = await payments.create(context('paid-key'), 'professional-monthly');
  const payload = {
    eventId: 'event-1',
    orderCode: order.orderCode,
    amountVnd: order.amountVnd,
    status: 'PAID',
  };
  const settled = await payments.applyWebhook(payload);
  const replay = await payments.applyWebhook(payload);
  assert.equal(settled.status, 'PAID');
  assert.equal(replay.status, 'PAID');
  assert.equal(database.inbox.size, 1);
  assert.equal(database.invoices.size, 1);
  assert.equal(database.audits.size, 1);
  assert.equal(database.subscriptions.size, 1);
  assert.equal(database.snapshots.size, 1);
  assert.equal(database.plans.size, 1);
});

void test('[BUA-007] webhook amount mismatch is rejected and never settles entitlement', async () => {
  const database = new FakeDatabase();
  const payments = service(database);
  const order = await payments.create(context('wrong-amount'), 'team-monthly');
  await assert.rejects(
    payments.applyWebhook({
      eventId: 'event-wrong',
      orderCode: order.orderCode,
      amountVnd: order.amountVnd - 1,
      status: 'PAID',
    }),
    (error: unknown) =>
      error instanceof PayosPaymentProblemError && error.code === 'PAYOS_AMOUNT_MISMATCH',
  );
  assert.equal(database.invoices.size, 0);
  assert.equal(database.audits.size, 0);
  assert.equal([...database.orders.values()][0]?.status, 'PENDING');
});

void test('[BUA-004] billing routes fail closed without permission', async () => {
  const payments = service(new FakeDatabase(), false);
  await assert.rejects(
    payments.plans(context('forbidden')),
    (error: unknown) =>
      error instanceof PayosPaymentProblemError && error.code === 'PAYOS_UNAUTHORIZED',
  );
});
