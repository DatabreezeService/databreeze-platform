import type {
  PlatformIdentityAnalyticsInputV1,
  PlatformIdentityAnalyticsPortV1,
  PlatformIdentityAnalyticsV1,
} from '../application/platform-administration.port.js';

interface CountDelegateV1 {
  count(input?: unknown): Promise<number>;
}

interface UserRowV1 {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly createdAt: Date;
}

interface OrganizationRowV1 {
  readonly id: string;
  readonly name: string;
}

export interface PlatformIdentityAnalyticsDatabaseClientV1 {
  readonly userIdentity: CountDelegateV1 & {
    findMany(input: unknown): Promise<readonly UserRowV1[]>;
  };
  readonly organizationIdentity: CountDelegateV1 & {
    findMany(input: unknown): Promise<readonly OrganizationRowV1[]>;
  };
  readonly workspaceIdentity: CountDelegateV1;
  readonly sessionRecord: CountDelegateV1;
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

/** IAM-026/BUA-024: bounded identity aggregates without tenant source content. */
export class PrismaPlatformIdentityAnalyticsAdapter implements PlatformIdentityAnalyticsPortV1 {
  public constructor(private readonly database: PlatformIdentityAnalyticsDatabaseClientV1) {}

  public async read(input: PlatformIdentityAnalyticsInputV1): Promise<PlatformIdentityAnalyticsV1> {
    const windows = monthWindows(input.startsAt, input.endsAt);
    const organizationIds = [...new Set(input.organizationIds)].slice(0, 40);
    const [
      users,
      activeUsers,
      organizations,
      workspaces,
      activeSessions,
      recentUsers,
      names,
      counts,
    ] = await Promise.all([
      this.database.userIdentity.count(),
      this.database.userIdentity.count({ where: { status: 'ACTIVE' } }),
      this.database.organizationIdentity.count(),
      this.database.workspaceIdentity.count(),
      this.database.sessionRecord.count({
        where: { status: 'ACTIVE', absoluteExpiresAt: { gt: input.endsAt } },
      }),
      this.database.userIdentity.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.recentLimit,
        select: { id: true, email: true, displayName: true, status: true, createdAt: true },
      }),
      organizationIds.length === 0
        ? Promise.resolve([] as readonly OrganizationRowV1[])
        : this.database.organizationIdentity.findMany({
            where: { id: { in: organizationIds } },
            select: { id: true, name: true },
          }),
      Promise.all(
        windows.map(({ start, end }) =>
          this.database.userIdentity.count({ where: { createdAt: { gte: start, lt: end } } }),
        ),
      ),
    ]);

    return Object.freeze({
      totals: Object.freeze({ users, activeUsers, organizations, workspaces, activeSessions }),
      registrationSeries: Object.freeze(
        windows.map(({ month }, index) => Object.freeze({ month, count: counts[index] ?? 0 })),
      ),
      recentUsers: Object.freeze(
        recentUsers.map((row) =>
          Object.freeze({
            userId: row.id,
            email: row.email,
            displayName: row.displayName,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
      ),
      organizationNames: Object.freeze(
        names.map((row) => Object.freeze({ organizationId: row.id, name: row.name })),
      ),
    });
  }
}
