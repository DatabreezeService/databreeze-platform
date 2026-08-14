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
  readonly occurrenceCount: number;
  readonly firstCreatedAt: string;
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
  readonly occurrenceCount: number;
  readonly firstOccurredAt: string;
  readonly lastOccurredAt: string;
}

const NOTIFICATION_COPY: Readonly<
  Record<
    DdaNotificationKind,
    { readonly labelVi: string; readonly labelEn: string; readonly actionRoute: string }
  >
> = Object.freeze({
  REVIEW_REQUIRED: {
    labelVi: 'Có mục cần xem xét',
    labelEn: 'Review required',
    actionRoute: '/inbox',
  },
  PREPARATION_BLOCKED: {
    labelVi: 'Chuẩn bị dữ liệu đang bị chặn',
    labelEn: 'Data preparation is blocked',
    actionRoute: '/data',
  },
  SOURCE_MISMATCH: {
    labelVi: 'Cần kiểm tra vị trí nguồn dữ liệu',
    labelEn: 'Source location needs review',
    actionRoute: '/data',
  },
  SYNC_FAILED: {
    labelVi: 'Đồng bộ chưa thành công',
    labelEn: 'Sync needs attention',
    actionRoute: '/data',
  },
  REFRESH_BLOCKED: {
    labelVi: 'Làm mới bảng điều khiển đang bị chặn',
    labelEn: 'Dashboard refresh is blocked',
    actionRoute: '/dashboards',
  },
  OCR_REVIEW_REQUIRED: {
    labelVi: 'Cần xem lại kết quả OCR',
    labelEn: 'OCR review required',
    actionRoute: '/data',
  },
  AGENT_BUDGET_DENIED: {
    labelVi: 'Đã đạt giới hạn sử dụng trợ lý',
    labelEn: 'Agent usage limit reached',
    actionRoute: '/analysis',
  },
  SECURITY_NOTICE: {
    labelVi: 'Có thông báo bảo mật',
    labelEn: 'Security notice',
    actionRoute: '/settings',
  },
});

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
  const acceptedEventIds = new Set<string>();
  for (const event of events) {
    if (acceptedEventIds.has(event.eventId)) continue;
    acceptedEventIds.add(event.eventId);
    const key = `${event.workspaceId}|${event.subjectId}|${event.kind}|${event.unresolved ? 'open' : 'resolved'}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        workspaceId: event.workspaceId,
        subjectId: event.subjectId,
        kind: event.kind,
        unresolved: event.unresolved,
        eventIds: [event.eventId],
        occurrenceCount: 1,
        firstCreatedAt: event.createdAt,
        latestCreatedAt: event.createdAt,
      });
      continue;
    }
    groups.set(key, {
      ...existing,
      eventIds: [...existing.eventIds, event.eventId],
      occurrenceCount: existing.occurrenceCount + 1,
      firstCreatedAt:
        event.createdAt < existing.firstCreatedAt ? event.createdAt : existing.firstCreatedAt,
      latestCreatedAt:
        event.createdAt > existing.latestCreatedAt ? event.createdAt : existing.latestCreatedAt,
    });
  }
  return Object.freeze([...groups.values()]);
}

function safeActionRoute(value: string | undefined, fallback: string): string {
  return value !== undefined &&
    value.length <= 240 &&
    /^\/(?:dashboards|analysis|data(?:\/[A-Za-z0-9_-]+)*|inbox|settings)$/u.test(value) &&
    !value.includes('?') &&
    !value.includes('#')
    ? value
    : fallback;
}

export function projectNotification(input: NotificationEventInput): ProjectedNotification {
  if (!(DDA_NOTIFICATION_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error('INVALID_NOTIFICATION_KIND');
  }
  const copy = NOTIFICATION_COPY[input.kind];
  return Object.freeze({
    eventId: input.eventId,
    workspaceId: input.workspaceId,
    subjectId: input.subjectId,
    kind: input.kind,
    unresolved: input.unresolved,
    createdAt: input.createdAt,
    correlationId: input.correlationId ?? input.eventId,
    actionRoute: safeActionRoute(input.actionRoute, copy.actionRoute),
    labelVi: copy.labelVi,
    labelEn: copy.labelEn,
    occurrenceCount: 1,
    firstOccurredAt: input.createdAt,
    lastOccurredAt: input.createdAt,
  });
}
