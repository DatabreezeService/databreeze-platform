import type {
  PlatformBillingAnalyticsInputV1,
  PlatformBillingAnalyticsPortV1,
  PlatformBillingAnalyticsV1,
} from '../application/platform-billing-analytics.port.js';

interface GroupCountV1 {
  readonly _count: { readonly _all: number };
  readonly status?: string;
  readonly planId?: string;
  readonly actorId?: string;
}

interface InvoiceAggregateV1 {
  readonly _sum: { readonly amountVnd: number | bigint | null };
  readonly _count: { readonly _all: number };
}

interface SubscriptionRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly planId: string;
  readonly source: string;
  readonly status: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly updatedAt: Date;
}

interface PaymentRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly amountVnd: number;
  readonly currency: string;
  readonly status: string;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
}

export interface PlatformBillingAnalyticsDatabaseClientV1 {
  readonly subscriptionRecord: {
    count(input?: unknown): Promise<number>;
    groupBy(input: unknown): Promise<readonly GroupCountV1[]>;
    findMany(input: unknown): Promise<readonly SubscriptionRowV1[]>;
  };
  readonly paymentOrderRecord: {
    groupBy(input: unknown): Promise<readonly GroupCountV1[]>;
    findMany(input: unknown): Promise<readonly PaymentRowV1[]>;
  };
  readonly invoiceRecord: {
    aggregate(input: unknown): Promise<InvoiceAggregateV1>;
  };
}

function utcMonthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, count: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + count, 1));
}

function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthWindows(startsAt: Date, endsAt: Date) {
  const result: { readonly start: Date; readonly end: Date; readonly month: string }[] = [];
  let cursor = utcMonthStart(startsAt);
  const endMonth = utcMonthStart(endsAt);
  while (cursor <= endMonth && result.length < 12) {
    const next = addUtcMonths(cursor, 1);
    result.push({ start: cursor, end: next, month: monthKey(cursor) });
    cursor = next;
  }
  return result;
}

function safeNumber(value: number | bigint | null): number {
  const numberValue = typeof value === 'bigint' ? Number(value) : (value ?? 0);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0)
    throw new Error('PLATFORM_BILLING_AGGREGATE_INVALID');
  return numberValue;
}

/** BUA-005/024: aggregates only committed BUA projections. */
export class PrismaPlatformBillingAnalyticsAdapter implements PlatformBillingAnalyticsPortV1 {
  public constructor(private readonly database: PlatformBillingAnalyticsDatabaseClientV1) {}

  public async read(input: PlatformBillingAnalyticsInputV1): Promise<PlatformBillingAnalyticsV1> {
    const windows = monthWindows(input.startsAt, input.endsAt);
    const [
      subscriptions,
      activeSubscriptions,
      statuses,
      plans,
      subscribers,
      settled,
      recentSubscriptions,
      recentPayments,
      monthly,
    ] = await Promise.all([
      this.database.subscriptionRecord.count(),
      this.database.subscriptionRecord.count({ where: { status: 'ACTIVE' } }),
      this.database.subscriptionRecord.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.database.subscriptionRecord.groupBy({
        by: ['planId'],
        _count: { _all: true },
        orderBy: { planId: 'asc' },
      }),
      this.database.paymentOrderRecord.groupBy({
        by: ['actorId'],
        where: { status: 'PAID' },
        _count: { _all: true },
      }),
      this.database.invoiceRecord.aggregate({
        where: { status: 'PAID' },
        _sum: { amountVnd: true },
        _count: { _all: true },
      }),
      this.database.subscriptionRecord.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: input.recentLimit,
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          planId: true,
          source: true,
          status: true,
          startsAt: true,
          endsAt: true,
          updatedAt: true,
        },
      }),
      this.database.paymentOrderRecord.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.recentLimit,
        select: {
          id: true,
          organizationId: true,
          planId: true,
          amountVnd: true,
          currency: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      Promise.all(
        windows.map(({ start, end }) =>
          this.database.invoiceRecord.aggregate({
            where: { status: 'PAID', paidAt: { gte: start, lt: end } },
            _sum: { amountVnd: true },
            _count: { _all: true },
          }),
        ),
      ),
    ]);

    const organizationIds = [
      ...new Set([
        ...recentSubscriptions.map((row) => row.organizationId),
        ...recentPayments.map((row) => row.organizationId),
      ]),
    ];

    return Object.freeze({
      totals: Object.freeze({
        subscriptions,
        activeSubscriptions,
        subscriberUsers: subscribers.length,
        settledRevenueVnd: safeNumber(settled._sum.amountVnd),
        paidOrders: settled._count._all,
      }),
      subscriptionStatuses: Object.freeze(
        statuses
          .filter(
            (row): row is GroupCountV1 & { readonly status: string } => row.status !== undefined,
          )
          .map((row) => Object.freeze({ key: row.status, count: row._count._all })),
      ),
      subscriptionPlans: Object.freeze(
        plans
          .filter(
            (row): row is GroupCountV1 & { readonly planId: string } => row.planId !== undefined,
          )
          .map((row) => Object.freeze({ key: row.planId, count: row._count._all })),
      ),
      revenueSeries: Object.freeze(
        windows.map(({ month }, index) => {
          const aggregate = monthly[index];
          return Object.freeze({
            month,
            revenueVnd: safeNumber(aggregate?._sum.amountVnd ?? null),
            paidOrders: aggregate?._count._all ?? 0,
          });
        }),
      ),
      recentSubscriptions: Object.freeze(
        recentSubscriptions.map((row) =>
          Object.freeze({
            subscriptionId: row.id,
            organizationId: row.organizationId,
            ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
            planId: row.planId,
            source: row.source,
            status: row.status,
            startsAt: row.startsAt.toISOString(),
            ...(row.endsAt === null ? {} : { endsAt: row.endsAt.toISOString() }),
            updatedAt: row.updatedAt.toISOString(),
          }),
        ),
      ),
      recentPayments: Object.freeze(
        recentPayments.map((row) => {
          if (row.currency !== 'VND') throw new Error('PLATFORM_BILLING_CURRENCY_UNSUPPORTED');
          return Object.freeze({
            paymentOrderId: row.id,
            organizationId: row.organizationId,
            planId: row.planId,
            amountVnd: safeNumber(row.amountVnd),
            currency: 'VND' as const,
            status: row.status,
            ...(row.paidAt === null ? {} : { paidAt: row.paidAt.toISOString() }),
            createdAt: row.createdAt.toISOString(),
          });
        }),
      ),
      organizationIds: Object.freeze(organizationIds),
    });
  }
}
