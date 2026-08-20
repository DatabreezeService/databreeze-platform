export type PlatformOperatorRoleV1 = 'PLATFORM_OWNER' | 'PLATFORM_SUPPORT';

export interface PlatformOperatorGrantV1 {
  readonly role: PlatformOperatorRoleV1;
  readonly revision: number;
}

/** IAM-026: resolves current internal authority from IAM, never from session claims. */
export interface PlatformOperatorAuthorityPortV1 {
  resolve(userId: string): Promise<PlatformOperatorGrantV1 | undefined>;
}

export interface PlatformIdentityAnalyticsInputV1 {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly recentLimit: number;
  readonly organizationIds: readonly string[];
}

export interface PlatformIdentityAnalyticsV1 {
  readonly totals: {
    readonly users: number;
    readonly activeUsers: number;
    readonly organizations: number;
    readonly workspaces: number;
    readonly activeSessions: number;
  };
  readonly registrationSeries: readonly {
    readonly month: string;
    readonly count: number;
  }[];
  readonly recentUsers: readonly {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
    readonly status: string;
    readonly createdAt: string;
  }[];
  readonly organizationNames: readonly {
    readonly organizationId: string;
    readonly name: string;
  }[];
}

/** IAM-owned aggregate reader. It returns identity metadata only. */
export interface PlatformIdentityAnalyticsPortV1 {
  read(input: PlatformIdentityAnalyticsInputV1): Promise<PlatformIdentityAnalyticsV1>;
}
