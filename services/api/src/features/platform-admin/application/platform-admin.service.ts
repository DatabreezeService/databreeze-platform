import type { PlatformAdminFeedbacks, PlatformAdminOverview } from '@databreeze/contracts/v4';

import type {
  PlatformIdentityAnalyticsPortV1,
  PlatformOperatorAuthorityPortV1,
} from '../../iam/application/platform-administration.port.js';
import type { PlatformBillingAnalyticsPortV1 } from '../../bua/application/platform-billing-analytics.port.js';
import type { LandingFeedbackListPortV1 } from '../../lfb/application/landing-feedback-intake.port.js';

export const PLATFORM_ADMIN_SERVICE = Symbol('PLATFORM_ADMIN_SERVICE');

export type PlatformAdminProblemCodeV1 = 'PLATFORM_ADMIN_FORBIDDEN' | 'PLATFORM_ADMIN_UNAVAILABLE';

export class PlatformAdminProblemError extends Error {
  public constructor(readonly code: PlatformAdminProblemCodeV1) {
    super(code);
    this.name = 'PlatformAdminProblemError';
  }
}

export interface PlatformAdminServiceOptionsV1 {
  readonly authority: PlatformOperatorAuthorityPortV1;
  readonly identities: PlatformIdentityAnalyticsPortV1;
  readonly billing: PlatformBillingAnalyticsPortV1;
  readonly feedbacks: LandingFeedbackListPortV1;
  readonly now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** IAM-026/BUA-024: read-only composition over provider-owned aggregate ports. */
export class PlatformAdminService {
  private readonly now: () => Date;

  public constructor(private readonly options: PlatformAdminServiceOptionsV1) {
    this.now = options.now ?? (() => new Date());
  }

  public async overview(actorId: string, days: number): Promise<PlatformAdminOverview> {
    let grant;
    try {
      grant = await this.options.authority.resolve(actorId);
    } catch {
      throw new PlatformAdminProblemError('PLATFORM_ADMIN_UNAVAILABLE');
    }
    if (grant === undefined) throw new PlatformAdminProblemError('PLATFORM_ADMIN_FORBIDDEN');

    const endsAt = this.now();
    const startsAt = new Date(endsAt.getTime() - days * DAY_MS);
    try {
      const billing = await this.options.billing.read({ startsAt, endsAt, recentLimit: 10 });
      const identities = await this.options.identities.read({
        startsAt,
        endsAt,
        recentLimit: 10,
        organizationIds: billing.organizationIds,
      });
      const names = new Map(
        identities.organizationNames.map((entry) => [entry.organizationId, entry.name]),
      );
      const organizationName = (organizationId: string) =>
        names.get(organizationId) ?? `Organization ${organizationId.slice(0, 8)}`;

      return Object.freeze({
        schemaVersion: 4 as const,
        generatedAt: endsAt.toISOString(),
        operator: Object.freeze({ role: grant.role }),
        window: Object.freeze({
          days,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
        totals: Object.freeze({ ...identities.totals, ...billing.totals }),
        subscriptionStatuses: Object.freeze([...billing.subscriptionStatuses]),
        subscriptionPlans: Object.freeze([...billing.subscriptionPlans]),
        registrationSeries: Object.freeze([...identities.registrationSeries]),
        revenueSeries: Object.freeze([...billing.revenueSeries]),
        recentUsers: Object.freeze([...identities.recentUsers]),
        recentSubscriptions: Object.freeze(
          billing.recentSubscriptions.map((row) =>
            Object.freeze({ ...row, organizationName: organizationName(row.organizationId) }),
          ),
        ),
        recentPayments: Object.freeze(
          billing.recentPayments.map((row) =>
            Object.freeze({ ...row, organizationName: organizationName(row.organizationId) }),
          ),
        ),
      });
    } catch (error) {
      if (error instanceof PlatformAdminProblemError) throw error;
      throw new PlatformAdminProblemError('PLATFORM_ADMIN_UNAVAILABLE');
    }
  }

  /** IAM-026/WEB-027: bounded content-minimized landing feedback review read. */
  public async feedbacks(actorId: string, limit: number): Promise<PlatformAdminFeedbacks> {
    let grant;
    try {
      grant = await this.options.authority.resolve(actorId);
    } catch {
      throw new PlatformAdminProblemError('PLATFORM_ADMIN_UNAVAILABLE');
    }
    if (grant === undefined) throw new PlatformAdminProblemError('PLATFORM_ADMIN_FORBIDDEN');

    try {
      const result = await this.options.feedbacks.readRecent(limit);
      return Object.freeze({
        schemaVersion: 4 as const,
        generatedAt: this.now().toISOString(),
        total: result.total,
        feedbacks: Object.freeze(
          result.items.map((item) =>
            Object.freeze({
              id: item.id,
              createdAt: item.createdAt,
              email: item.email,
              ...(item.name === undefined ? {} : { name: item.name }),
              ...(item.organization === undefined ? {} : { organization: item.organization }),
              role: item.role,
              experience: item.experience,
              category: item.category,
              rating: item.rating,
              message: item.message,
              contactPermission: item.contactPermission,
            }),
          ),
        ),
      });
    } catch (error) {
      if (error instanceof PlatformAdminProblemError) throw error;
      throw new PlatformAdminProblemError('PLATFORM_ADMIN_UNAVAILABLE');
    }
  }
}
