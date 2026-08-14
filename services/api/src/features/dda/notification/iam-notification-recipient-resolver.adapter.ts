import { createHash } from 'node:crypto';

import { parseStableIdentifierV1, tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
} from '../../../platform/iam-membership.port.js';
import { createIamTenantContextV1 } from '../../../platform/iam-tenant-context.js';
import type {
  AuthorizedNotificationRecipientV1,
  CommittedNotificationEventV1,
  NotificationRecipientResolutionResultV1,
  NotificationResourceAuthorizationPortV1,
  NotificationRecipientResolverPortV1,
} from './notification-projection-consumer.js';
import { UnavailableNotificationResourceAuthorizationAdapter } from './notification-projection-consumer.js';

type ClockV1 = () => Date;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function activeAt(membership: IamMembershipRecordV1, now: Date): boolean {
  const timestamp = now.getTime();
  const startsAt = membership.startsAt === undefined ? undefined : Date.parse(membership.startsAt);
  const expiresAt =
    membership.expiresAt === undefined ? undefined : Date.parse(membership.expiresAt);
  return (
    membership.status === 'ACTIVE' &&
    (startsAt === undefined || (Number.isFinite(startsAt) && startsAt <= timestamp)) &&
    (expiresAt === undefined || (Number.isFinite(expiresAt) && expiresAt > timestamp))
  );
}

function proofFor(
  event: CommittedNotificationEventV1,
  membership: IamMembershipRecordV1,
): AuthorizedNotificationRecipientV1 {
  const token = digest(
    [
      event.tenantScope.organizationId,
      event.tenantScope.workspaceId,
      event.eventId,
      event.eventHash,
      membership.id,
      membership.principalId,
      membership.revision,
    ].join('|'),
  );
  return Object.freeze({
    recipientId: membership.principalId,
    proof: Object.freeze({
      organizationId: event.tenantScope.organizationId,
      workspaceId: event.tenantScope.workspaceId,
      recipientId: membership.principalId,
      subjectId: event.subjectId,
      eventId: event.eventId,
      authorizationEpoch: membership.revision,
      token,
    }),
  });
}

/**
 * Resolves only active IAM memberships whose organization or exact workspace
 * scope contains the committed notification workspace. DDA never reads IAM
 * persistence directly; the IAM repository is the application-port boundary.
 */
export class IamNotificationRecipientResolverAdapter
  implements NotificationRecipientResolverPortV1
{
  public constructor(
    private readonly memberships: IamRepositoryPortV1,
    private readonly resourceAuthorization: NotificationResourceAuthorizationPortV1 = new UnavailableNotificationResourceAuthorizationAdapter(),
    private readonly clock: ClockV1 = () => new Date(),
  ) {}

  public async resolve(
    event: CommittedNotificationEventV1,
  ): Promise<NotificationRecipientResolutionResultV1> {
    if (
      event.tenantScope.scopeType !== 'workspace' ||
      !parseStableIdentifierV1(event.tenantScope.organizationId).accepted ||
      !parseStableIdentifierV1(event.tenantScope.workspaceId).accepted ||
      !parseStableIdentifierV1(event.eventId).accepted ||
      !parseStableIdentifierV1(event.subjectId).accepted ||
      !parseStableIdentifierV1(event.correlationId).accepted
    ) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    let now: Date;
    try {
      now = this.clock();
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    const organizationId = parseStableIdentifierV1(event.tenantScope.organizationId);
    const workspaceId = parseStableIdentifierV1(event.tenantScope.workspaceId);
    if (!organizationId.accepted || !workspaceId.accepted) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    const tenantScope = {
      scopeType: 'workspace' as const,
      organizationId: organizationId.value,
      workspaceId: workspaceId.value,
    };
    const contextResult = createIamTenantContextV1({
      tenantScope,
      actorId: event.subjectId,
      correlationId: event.correlationId,
      idempotencyKey: `notification-recipient:${event.eventId}`,
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    });
    if (!contextResult.accepted) return { accepted: false, code: 'UNAVAILABLE' };
    let rows: readonly IamMembershipRecordV1[];
    try {
      rows = await this.memberships.listMemberships(contextResult.value);
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }

    const selected = new Map<string, IamMembershipRecordV1>();
    for (const membership of rows) {
      if (!activeAt(membership, now) || !tenantScopeContainsV1(membership.scope, tenantScope)) {
        continue;
      }
      const current = selected.get(membership.principalId);
      if (
        current === undefined ||
        (current.scope.scopeType === 'organization' &&
          membership.scope.scopeType === 'workspace') ||
        (current.scope.scopeType === membership.scope.scopeType && membership.id < current.id)
      ) {
        selected.set(membership.principalId, membership);
      }
    }
    const authorized: IamMembershipRecordV1[] = [];
    for (const membership of selected.values()) {
      let authorization: Awaited<ReturnType<NotificationResourceAuthorizationPortV1['authorize']>>;
      try {
        authorization = await this.resourceAuthorization.authorize({
          event,
          recipientId: membership.principalId,
        });
      } catch {
        return { accepted: false, code: 'UNAVAILABLE' };
      }
      if (authorization.accepted === false) {
        if (authorization.code === 'DENIED') continue;
        return { accepted: false, code: 'UNAVAILABLE' };
      }
      authorized.push(membership);
    }
    return {
      accepted: true,
      recipients: Object.freeze(
        authorized
          .sort((left, right) => left.principalId.localeCompare(right.principalId))
          .map((membership) => proofFor(event, membership)),
      ),
    };
  }
}
