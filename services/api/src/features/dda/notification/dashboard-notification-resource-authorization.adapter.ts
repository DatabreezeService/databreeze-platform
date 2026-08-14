import type { DashboardAuthorizationPortV1 } from '../dashboard/application/dashboard-authorization.port.js';
import { createIamTenantContextV1 } from '../../../platform/iam-tenant-context.js';
import type {
  CommittedNotificationEventV1,
  NotificationResourceAuthorizationPortV1,
  NotificationResourceAuthorizationResultV1,
} from './notification-projection-consumer.js';

export const DDA_NOTIFICATION_RESOURCE_AUTHORIZATION = Symbol(
  'DDA_NOTIFICATION_RESOURCE_AUTHORIZATION',
);

/** Reuses the canonical dashboard/IAM authority without accepting notification-supplied grants. */
export class DashboardNotificationResourceAuthorizationAdapter
  implements NotificationResourceAuthorizationPortV1
{
  public constructor(private readonly authorization: DashboardAuthorizationPortV1) {}

  public async authorize(input: {
    readonly event: CommittedNotificationEventV1;
    readonly recipientId: string;
  }): Promise<NotificationResourceAuthorizationResultV1> {
    const context = createIamTenantContextV1({
      tenantScope: input.event.tenantScope,
      actorId: input.recipientId,
      correlationId: input.event.correlationId,
      idempotencyKey: `notification-resource:${input.event.eventId}:${input.recipientId}`,
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    });
    if (!context.accepted) return { accepted: false, code: 'UNAVAILABLE' };

    try {
      const decision = await this.authorization.authorizeDashboardAction({
        context: context.value,
        tenantScope: input.event.tenantScope,
        actorId: input.recipientId,
        dashboardId: input.event.subjectId,
        action: 'VIEW',
      });
      return decision.allowed === true ? { accepted: true } : { accepted: false, code: 'DENIED' };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}
