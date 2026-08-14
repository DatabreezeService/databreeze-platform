import type {
  DdaNotification,
  DdaNotificationPage,
  DdaNotificationStateCommand,
} from '@databreeze/contracts/v3';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useEffect, useMemo, useState } from 'react';

import type { NotificationCenterItem, NotificationCenterState } from './notification-center.tsx';
import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
  parseStrictUtcTimestampBrowser,
} from '../../lib/browser-validation.ts';

export type NotificationStoreStatus = 'loading' | 'error' | 'ready' | 'confirmed-empty';

export interface NotificationStoreItem {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly kind: DdaNotification['kind'];
  readonly labelVi: string;
  readonly labelEn: string;
  readonly action: DdaNotification['action'];
  readonly createdAt: string;
  readonly correlationId: string;
  readonly state: DdaNotification['state'];
  readonly revision: number;
}

export interface NotificationStoreState {
  readonly status: NotificationStoreStatus;
  readonly items: readonly NotificationStoreItem[];
  readonly unreadCount: number;
  readonly nextCursor?: string;
  readonly error?: string;
}

export interface NotificationStore {
  getState(): NotificationStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  loadNextPage(): Promise<void>;
  retry(): Promise<void>;
  setState(input: {
    readonly notificationId: string;
    readonly state: Exclude<DdaNotification['state'], 'UNREAD'>;
    readonly expectedRevision: number;
    readonly idempotencyKey?: string;
  }): Promise<void>;
  markRead(notificationId: string, expectedRevision: number): Promise<void>;
  archive(notificationId: string, expectedRevision: number): Promise<void>;
  dismiss(notificationId: string, expectedRevision: number): Promise<void>;
}

export interface NotificationStoreOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly pageSize?: number;
}

const NOTIFICATION_KINDS = new Set([
  'REVIEW_REQUIRED',
  'PREPARATION_BLOCKED',
  'SOURCE_MISMATCH',
  'SYNC_FAILED',
  'REFRESH_BLOCKED',
  'OCR_REVIEW_REQUIRED',
  'AGENT_BUDGET_DENIED',
  'SECURITY_NOTICE',
]);
const NOTIFICATION_ACTIONS = new Set([
  'OPEN_DASHBOARDS',
  'OPEN_ANALYSIS',
  'OPEN_DATA',
  'OPEN_INBOX',
  'OPEN_SETTINGS',
]);
const CURSOR_PATTERN = /^cursor-v1-[A-Za-z0-9_-]{1,480}$/u;
const FORBIDDEN_CONTENT_PATTERN =
  /(?:https?:\/\/|\\\\|\b(?:password|passwd|secret|credential|api[-_ ]?key|access[-_ ]?token|provider|openai|anthropic)\b|^[A-Za-z]:[\\/])/iu;

const parseStableIdentifier = parseStableIdentifierBrowser;
const parseStrictUtcTimestamp = parseStrictUtcTimestampBrowser;

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function safeLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 160 &&
    value.trim() === value &&
    !hasControlCharacters(value) &&
    !FORBIDDEN_CONTENT_PATTERN.test(value)
  );
}

async function parsePage(payload: unknown): Promise<DdaNotificationPage> {
  if (
    !isRecordBrowser(payload) ||
    !hasOnlyKeysBrowser(payload, ['schemaVersion', 'items', 'nextCursor', 'unreadCount']) ||
    payload['schemaVersion'] !== 3 ||
    !Array.isArray(payload['items']) ||
    payload['items'].length > 50 ||
    !Number.isSafeInteger(payload['unreadCount']) ||
    (payload['unreadCount'] as number) < 0 ||
    (payload['unreadCount'] as number) > 1_000_000 ||
    (payload['nextCursor'] !== undefined &&
      (typeof payload['nextCursor'] !== 'string' || !CURSOR_PATTERN.test(payload['nextCursor'])))
  ) {
    throw new Error('NOTIFICATION_RESPONSE_INVALID');
  }
  for (const item of payload['items']) {
    if (!isRecordBrowser(item)) throw new Error('NOTIFICATION_RESPONSE_INVALID');
    await validateNotification(item as unknown as DdaNotification);
  }
  return payload as unknown as DdaNotificationPage;
}

async function validateNotification(item: DdaNotification): Promise<void> {
  if (
    !hasOnlyKeysBrowser(item as unknown as Record<string, unknown>, [
      'schemaVersion',
      'id',
      'workspaceId',
      'subjectId',
      'kind',
      'labelVi',
      'labelEn',
      'action',
      'createdAt',
      'correlationId',
      'state',
      'revision',
    ]) ||
    item.schemaVersion !== 3 ||
    !['UNREAD', 'READ', 'ARCHIVED', 'DISMISSED'].includes(item.state)
  ) {
    throw new Error('NOTIFICATION_RESPONSE_INVALID');
  }
  const [id, workspaceId, subjectId, correlationId, createdAt] = await Promise.all([
    parseStableIdentifier(item.id),
    parseStableIdentifier(item.workspaceId),
    parseStableIdentifier(item.subjectId),
    parseStableIdentifier(item.correlationId),
    parseStrictUtcTimestamp(item.createdAt),
  ]);
  if (
    !NOTIFICATION_KINDS.has(item.kind) ||
    !NOTIFICATION_ACTIONS.has(item.action) ||
    !safeLabel(item.labelVi) ||
    !safeLabel(item.labelEn) ||
    !id.accepted ||
    !workspaceId.accepted ||
    !subjectId.accepted ||
    !correlationId.accepted ||
    !createdAt.accepted ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 1
  ) {
    throw new Error('NOTIFICATION_RESPONSE_INVALID');
  }
}

async function parseNotification(payload: unknown): Promise<DdaNotification> {
  if (
    !isRecordBrowser(payload) ||
    !hasOnlyKeysBrowser(payload, [
      'schemaVersion',
      'id',
      'workspaceId',
      'subjectId',
      'kind',
      'labelVi',
      'labelEn',
      'action',
      'createdAt',
      'correlationId',
      'state',
      'revision',
    ]) ||
    payload['schemaVersion'] !== 3
  ) {
    throw new Error('NOTIFICATION_RESPONSE_INVALID');
  }
  const notification = payload as unknown as DdaNotification;
  await validateNotification(notification);
  return notification;
}

function toStoreItem(item: DdaNotification): NotificationStoreItem {
  return Object.freeze({
    eventId: item.id,
    workspaceId: item.workspaceId,
    subjectId: item.subjectId,
    kind: item.kind,
    labelVi: item.labelVi,
    labelEn: item.labelEn,
    action: item.action,
    createdAt: item.createdAt,
    correlationId: item.correlationId,
    state: item.state,
    revision: item.revision,
  });
}

function initialState(): NotificationStoreState {
  return Object.freeze({ status: 'loading', items: Object.freeze([]), unreadCount: 0 });
}

function errorState(previous: NotificationStoreState, error: unknown): NotificationStoreState {
  return Object.freeze({
    ...previous,
    status: 'error' as const,
    error: error instanceof Error ? error.message : 'NOTIFICATION_REQUEST_FAILED',
  });
}

export function createNotificationStore(options: NotificationStoreOptions = {}): NotificationStore {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const pageSize = Math.min(50, Math.max(1, Math.floor(options.pageSize ?? 20)));
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const listeners = new Set<() => void>();
  let state = initialState();
  let loading = false;

  function update(next: NotificationStoreState): void {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  async function request(cursor?: string): Promise<void> {
    if (loading) return;
    loading = true;
    update({
      status: 'loading',
      items: state.items,
      unreadCount: state.unreadCount,
      ...(state.nextCursor === undefined ? {} : { nextCursor: state.nextCursor }),
    });
    try {
      if (baseUrl === '') throw new Error('NOTIFICATION_API_UNAVAILABLE');
      const query = new URLSearchParams({ limit: String(pageSize) });
      if (cursor !== undefined) query.set('cursor', cursor);
      const response = await fetcher(`${baseUrl}/v3/notifications?${query.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'NOTIFICATION_UNAUTHORIZED'
            : 'NOTIFICATION_REQUEST_FAILED',
        );
      }
      const page = await parsePage(await response.json());
      const items =
        cursor === undefined
          ? page.items.map(toStoreItem)
          : [...state.items, ...page.items.map(toStoreItem)];
      update({
        status: items.length === 0 ? 'confirmed-empty' : 'ready',
        items: Object.freeze(items),
        unreadCount: page.unreadCount,
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      });
    } catch (error) {
      update(errorState(state, error));
    } finally {
      loading = false;
    }
  }

  async function setState(input: {
    readonly notificationId: string;
    readonly state: Exclude<DdaNotification['state'], 'UNREAD'>;
    readonly expectedRevision: number;
    readonly idempotencyKey?: string;
  }): Promise<void> {
    if (loading) return;
    loading = true;
    update({
      status: 'loading',
      items: state.items,
      unreadCount: state.unreadCount,
      ...(state.nextCursor === undefined ? {} : { nextCursor: state.nextCursor }),
    });
    try {
      const parsedNotificationId = parseStableIdentifier(input.notificationId);
      if (
        !parsedNotificationId.accepted ||
        !['READ', 'ARCHIVED', 'DISMISSED'].includes(input.state) ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new Error('NOTIFICATION_COMMAND_INVALID');
      }
      const idempotencyKey =
        input.idempotencyKey ??
        `notification-state-${input.notificationId}-${Date.now().toString(36)}`;
      const command: DdaNotificationStateCommand = {
        schemaVersion: 3,
        state: input.state,
        expectedRevision: input.expectedRevision,
        idempotencyKey,
      };
      const parsedCommand =
        command.schemaVersion === 3 &&
        ['READ', 'ARCHIVED', 'DISMISSED'].includes(command.state) &&
        Number.isSafeInteger(command.expectedRevision) &&
        command.expectedRevision >= 1 &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(command.idempotencyKey);
      if (
        baseUrl === '' ||
        idempotencyKey.length > 200 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(idempotencyKey) ||
        !parsedCommand
      ) {
        throw new Error('NOTIFICATION_COMMAND_INVALID');
      }
      const response = await fetcher(
        `${baseUrl}/v3/notifications/${encodeURIComponent(input.notificationId)}`,
        {
          method: 'PATCH',
          headers: { Accept: 'application/json', 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(command),
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? 'NOTIFICATION_REVISION_CONFLICT'
            : response.status === 401 || response.status === 403
              ? 'NOTIFICATION_UNAUTHORIZED'
              : 'NOTIFICATION_MUTATION_FAILED',
        );
      }
      const updated = await parseNotification(await response.json());
      if (updated.id !== input.notificationId || updated.state !== input.state) {
        throw new Error('NOTIFICATION_RESPONSE_INVALID');
      }
      const existing = state.items.findIndex((item) => item.eventId === updated.id);
      if (existing >= 0) {
        const nextItems = [...state.items];
        nextItems[existing] = toStoreItem(updated);
        update({ ...state, items: Object.freeze(nextItems) });
      }
      loading = false;
      await request();
    } catch (error) {
      update(errorState(state, error));
      throw error;
    } finally {
      loading = false;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: () => request(),
    loadNextPage: () =>
      state.nextCursor === undefined ? Promise.resolve() : request(state.nextCursor),
    retry: () => request(),
    setState,
    markRead: (notificationId, expectedRevision) =>
      setState({ notificationId, expectedRevision, state: 'READ' }),
    archive: (notificationId, expectedRevision) =>
      setState({ notificationId, expectedRevision, state: 'ARCHIVED' }),
    dismiss: (notificationId, expectedRevision) =>
      setState({ notificationId, expectedRevision, state: 'DISMISSED' }),
  };
}

const ACTION_PATHS: Readonly<Record<string, string>> = Object.freeze({
  OPEN_DASHBOARDS: 'dashboards',
  OPEN_ANALYSIS: 'analysis',
  OPEN_DATA: 'data',
  OPEN_INBOX: 'inbox',
  OPEN_SETTINGS: 'administration',
});

export function notificationActionPath(
  locale: SupportedLocaleV1,
  action: unknown,
): string | undefined {
  if (typeof action !== 'string' || !NOTIFICATION_ACTIONS.has(action)) return undefined;
  const path = ACTION_PATHS[action];
  return path === undefined ? undefined : `/${locale}/${path}`;
}

export function notificationCenterStateForLocale(
  locale: SupportedLocaleV1,
  state: NotificationStoreState,
): NotificationCenterState {
  const items: readonly NotificationCenterItem[] = state.items.map((item) => {
    const actionRoute = notificationActionPath(locale, item.action);
    return {
      eventId: item.eventId,
      kind: item.kind,
      label: locale === 'vi-VN' ? item.labelVi : item.labelEn,
      unresolved: item.state === 'UNREAD',
      state: item.state as NonNullable<NotificationCenterItem['state']>,
      revision: item.revision,
      ...(actionRoute === undefined ? {} : { actionRoute }),
    };
  });
  return Object.freeze({
    status: state.status === 'confirmed-empty' ? 'confirmed-empty' : state.status,
    items: Object.freeze(items),
    unreadCount: state.unreadCount,
  });
}

export function useNotificationStoreState(
  locale: SupportedLocaleV1,
  enabled = true,
): NotificationCenterState {
  const store = useMemo(() => createNotificationStore(), []);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = store.subscribe(() => rerender((value) => value + 1));
    void store.load();
    return unsubscribe;
  }, [enabled, store]);
  return notificationCenterStateForLocale(locale, store.getState());
}

export function useNotificationStoreResource(
  locale: SupportedLocaleV1,
  enabled = true,
): {
  readonly state: NotificationCenterState;
  readonly retry: () => Promise<void>;
  readonly markRead: (notificationId: string, expectedRevision: number) => Promise<void>;
  readonly archive: (notificationId: string, expectedRevision: number) => Promise<void>;
  readonly dismiss: (notificationId: string, expectedRevision: number) => Promise<void>;
} {
  const store = useMemo(() => createNotificationStore(), []);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = store.subscribe(() => rerender((value) => value + 1));
    void store.load();
    return unsubscribe;
  }, [enabled, store]);
  return {
    state: notificationCenterStateForLocale(locale, store.getState()),
    retry: () => store.retry(),
    markRead: (notificationId, expectedRevision) =>
      store.markRead(notificationId, expectedRevision),
    archive: (notificationId, expectedRevision) => store.archive(notificationId, expectedRevision),
    dismiss: (notificationId, expectedRevision) => store.dismiss(notificationId, expectedRevision),
  };
}
