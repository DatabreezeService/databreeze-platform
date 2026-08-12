export const DDA_NOTIFICATION_KINDS = Object.freeze([
  'REVIEW_REQUIRED',
  'PREPARATION_BLOCKED',
  'SOURCE_MISMATCH',
  'SYNC_FAILED',
  'REFRESH_BLOCKED',
  'OCR_REVIEW_REQUIRED',
  'AGENT_BUDGET_DENIED',
  'SECURITY_NOTICE',
] as const);

export type DdaNotificationKind = (typeof DDA_NOTIFICATION_KINDS)[number];

export interface NotificationEventInput {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly kind: DdaNotificationKind;
  readonly unresolved: boolean;
  readonly createdAt: string;
  readonly correlationId?: string;
  readonly actionRoute?: string;
  readonly labelVi?: string;
  readonly labelEn?: string;
}

export interface GroupedNotification {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly kind: DdaNotificationKind;
  readonly unresolved: boolean;
  readonly eventIds: readonly string[];
  readonly latestCreatedAt: string;
}

export interface ProjectedNotification {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly kind: DdaNotificationKind;
  readonly unresolved: boolean;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly actionRoute: string;
  readonly labelVi: string;
  readonly labelEn: string;
}

export function shouldSuppressRoutineRefresh(input: {
  readonly kind: string;
  readonly outcome: string;
}): boolean {
  return input.kind === 'REFRESH_SUCCEEDED' && input.outcome === 'SUCCEEDED';
}

export function groupNotificationEvents(
  events: readonly NotificationEventInput[],
): readonly GroupedNotification[] {
  const groups = new Map<string, GroupedNotification>();
  for (const event of events) {
    const key = `${event.workspaceId}|${event.subjectId}|${event.kind}|${event.unresolved ? 'open' : 'resolved'}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        workspaceId: event.workspaceId,
        subjectId: event.subjectId,
        kind: event.kind,
        unresolved: event.unresolved,
        eventIds: [event.eventId],
        latestCreatedAt: event.createdAt,
      });
      continue;
    }
    groups.set(key, {
      ...existing,
      eventIds: [...existing.eventIds, event.eventId],
      latestCreatedAt:
        event.createdAt > existing.latestCreatedAt ? event.createdAt : existing.latestCreatedAt,
    });
  }
  return Object.freeze([...groups.values()]);
}

export function projectNotification(input: NotificationEventInput): ProjectedNotification {
  if (!(DDA_NOTIFICATION_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error('INVALID_NOTIFICATION_KIND');
  }
  return Object.freeze({
    eventId: input.eventId,
    workspaceId: input.workspaceId,
    subjectId: input.subjectId,
    kind: input.kind,
    unresolved: input.unresolved,
    createdAt: input.createdAt,
    correlationId: input.correlationId ?? input.eventId,
    actionRoute: input.actionRoute ?? '/',
    labelVi: input.labelVi ?? input.kind,
    labelEn: input.labelEn ?? input.kind,
  });
}
