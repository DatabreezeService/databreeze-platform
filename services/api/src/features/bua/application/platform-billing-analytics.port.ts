export interface PlatformBillingAnalyticsInputV1 {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly recentLimit: number;
}

export interface PlatformBillingAnalyticsV1 {
  readonly totals: {
    readonly subscriptions: number;
    readonly activeSubscriptions: number;
    readonly subscriberUsers: number;
    readonly settledRevenueVnd: number;
    readonly paidOrders: number;
  };
  readonly subscriptionStatuses: readonly { readonly key: string; readonly count: number }[];
  readonly subscriptionPlans: readonly { readonly key: string; readonly count: number }[];
  readonly revenueSeries: readonly {
    readonly month: string;
    readonly revenueVnd: number;
    readonly paidOrders: number;
  }[];
  readonly recentSubscriptions: readonly {
    readonly subscriptionId: string;
    readonly organizationId: string;
    readonly workspaceId?: string;
    readonly planId: string;
    readonly source: string;
    readonly status: string;
    readonly startsAt: string;
    readonly endsAt?: string;
    readonly updatedAt: string;
  }[];
  readonly recentPayments: readonly {
    readonly paymentOrderId: string;
    readonly organizationId: string;
    readonly planId: string;
    readonly amountVnd: number;
    readonly currency: 'VND';
    readonly status: string;
    readonly paidAt?: string;
    readonly createdAt: string;
  }[];
  readonly organizationIds: readonly string[];
}

/** BUA-024: provider-independent, authoritative commercial aggregates. */
export interface PlatformBillingAnalyticsPortV1 {
  read(input: PlatformBillingAnalyticsInputV1): Promise<PlatformBillingAnalyticsV1>;
}
