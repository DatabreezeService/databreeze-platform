import { randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

export type RefreshEventKindV1 =
  | 'SNAPSHOT_COMMITTED'
  | 'FRESHNESS_CHANGED'
  | 'REFRESH_BLOCKED'
  | 'REFRESH_FAILED';

export interface ContentSafeRefreshEventV1 {
  readonly sequence: number;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly freshnessState: 'FRESH' | 'STALE' | 'PENDING' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
  readonly eventHash: string;
  readonly occurredAt: string;
}

/** Only opaque identifiers, hashes, and bounded diagnostic codes may be persisted. */
export type RefreshEventMetadataInputV1 = Readonly<Record<string, unknown>>;
export type ContentSafeRefreshMetadataV1 = Readonly<Record<string, string>>;

export interface RefreshEventAppendInputV1 {
  readonly eventId?: string;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly freshnessState: ContentSafeRefreshEventV1['freshnessState'];
  readonly eventHash: string;
  readonly occurredAt: string;
  readonly eventKind: RefreshEventKindV1;
  readonly correlationId: string;
  readonly authorizationEpoch?: number;
  readonly metadata: RefreshEventMetadataInputV1;
}

export function createCommittedSnapshotRefreshEventV1(input: {
  readonly dashboardId: string;
  readonly refreshId: string;
  readonly snapshot: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardVersionId: string;
    readonly snapshotId: string;
    readonly freshnessState: ContentSafeRefreshEventV1['freshnessState'];
    readonly eventHash: string;
    readonly occurredAt: string;
    readonly inputSelectorHash: string;
  };
}): RefreshEventAppendInputV1 {
  return Object.freeze({
    tenantScope: input.snapshot.tenantScope,
    dashboardId: input.dashboardId,
    snapshotId: input.snapshot.snapshotId,
    freshnessState: input.snapshot.freshnessState,
    eventHash: input.snapshot.eventHash,
    occurredAt: input.snapshot.occurredAt,
    eventKind: 'SNAPSHOT_COMMITTED',
    correlationId: input.refreshId,
    metadata: Object.freeze({
      refreshId: input.refreshId,
      dashboardVersionId: input.snapshot.dashboardVersionId,
      inputSelectorHash: input.snapshot.inputSelectorHash,
    }),
  });
}

export interface DurableRefreshEventRecordV1
  extends Omit<RefreshEventAppendInputV1, 'eventId' | 'metadata'> {
  readonly eventId: string;
  readonly sequence: number;
  readonly metadata: ContentSafeRefreshMetadataV1;
}

export interface RefreshEventPageV1 {
  readonly events: readonly DurableRefreshEventRecordV1[];
  readonly highestSequence: number;
  readonly oldestSequence: number;
  readonly hasMore: boolean;
}

export interface RefreshEventDurableStoreV1 {
  append(input: RefreshEventAppendInputV1): Promise<DurableRefreshEventRecordV1>;
  list(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly cursor: number;
    readonly limit: number;
  }): Promise<RefreshEventPageV1>;
}

export const MAX_REFRESH_EVENT_REPLAY_V1 = 100;
const MAX_RETAINED_REFRESH_EVENTS = 1_024;
const MAX_REFRESH_EVENT_METADATA_KEYS = 8;
const MAX_REFRESH_EVENT_METADATA_BYTES = 1_024;
const MAX_REFRESH_EVENT_POLL_INTERVAL_MS = 30_000;

const EVENT_KEYS = new Set([
  'sequence',
  'tenantScope',
  'dashboardId',
  'snapshotId',
  'freshnessState',
  'eventHash',
  'occurredAt',
]);

const FRESHNESS_STATES = new Set<ContentSafeRefreshEventV1['freshnessState']>([
  'FRESH',
  'STALE',
  'PENDING',
  'BLOCKED',
  'SOURCE_UNAVAILABLE',
]);

const EVENT_KINDS = new Set<RefreshEventKindV1>([
  'SNAPSHOT_COMMITTED',
  'FRESHNESS_CHANGED',
  'REFRESH_BLOCKED',
  'REFRESH_FAILED',
]);

const METADATA_KEYS = new Set([
  'refreshId',
  'dashboardVersionId',
  'permissionProjectionVersionId',
  'inputSelectorHash',
  'reasonCode',
]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function hasExactKeys(input: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const ownKeys = Object.keys(input);
  return ownKeys.length === keys.size && ownKeys.every((key) => keys.has(key));
}

function safeIdentifier(input: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function safeHash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

function safeMetadata(input: unknown): ContentSafeRefreshMetadataV1 | undefined {
  if (!isRecord(input)) return undefined;
  const keys = Object.keys(input);
  if (keys.length > MAX_REFRESH_EVENT_METADATA_KEYS) return undefined;

  const metadata: Record<string, string> = {};
  for (const key of keys) {
    if (!METADATA_KEYS.has(key)) return undefined;
    const value = input[key];
    if (typeof value !== 'string' || value.length === 0 || value.length > 128) return undefined;
    if (key === 'reasonCode') {
      if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(value)) return undefined;
    } else if (key.endsWith('Hash')) {
      if (safeHash(value) === undefined) return undefined;
    } else if (safeIdentifier(value) === undefined) {
      return undefined;
    }
    metadata[key] = value;
  }

  try {
    const serialized = JSON.stringify(metadata);
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, 'utf8') > MAX_REFRESH_EVENT_METADATA_BYTES
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return Object.freeze(metadata);
}

function validateAppendInput(input: unknown): RefreshEventAppendInputV1 | undefined {
  if (!isRecord(input)) return undefined;
  const tenantScope = parseTenantScopeV1(input['tenantScope']);
  const dashboardId = safeIdentifier(input['dashboardId']);
  const snapshotId = safeIdentifier(input['snapshotId']);
  const correlationId = safeIdentifier(input['correlationId']);
  const occurredAt = parseStrictUtcTimestampV1(input['occurredAt']);
  const eventHash = safeHash(input['eventHash']);
  const eventKind = input['eventKind'];
  const authorizationEpoch = input['authorizationEpoch'];
  const eventId = input['eventId'];
  if (
    !tenantScope.accepted ||
    dashboardId === undefined ||
    snapshotId === undefined ||
    correlationId === undefined ||
    !occurredAt.accepted ||
    eventHash === undefined ||
    typeof eventKind !== 'string' ||
    !EVENT_KINDS.has(eventKind as RefreshEventKindV1)
  ) {
    return undefined;
  }
  const parsedEventId = eventId === undefined ? undefined : safeIdentifier(eventId);
  if (eventId !== undefined && parsedEventId === undefined) return undefined;
  if (
    authorizationEpoch !== undefined &&
    (typeof authorizationEpoch !== 'number' ||
      !Number.isSafeInteger(authorizationEpoch) ||
      authorizationEpoch < 0)
  ) {
    return undefined;
  }
  const metadata = safeMetadata(input['metadata']);
  const freshnessState = input['freshnessState'];
  if (
    typeof freshnessState !== 'string' ||
    !FRESHNESS_STATES.has(freshnessState as ContentSafeRefreshEventV1['freshnessState']) ||
    metadata === undefined
  ) {
    return undefined;
  }

  return Object.freeze({
    ...(parsedEventId === undefined ? {} : { eventId: parsedEventId }),
    tenantScope: tenantScope.value,
    dashboardId,
    snapshotId,
    freshnessState: freshnessState as ContentSafeRefreshEventV1['freshnessState'],
    eventHash,
    occurredAt: occurredAt.value,
    eventKind: eventKind as RefreshEventKindV1,
    correlationId,
    ...(authorizationEpoch === undefined ? {} : { authorizationEpoch }),
    metadata,
  });
}

export function assertRefreshEventAppendInputV1(input: unknown): RefreshEventAppendInputV1 {
  const normalized = validateAppendInput(input);
  if (normalized === undefined) throw new Error('INVALID_REFRESH_EVENT');
  return normalized;
}

/**
 * Runtime boundary for producer output. The returned object is a fresh, frozen allowlist
 * projection so producer-owned fields cannot reach an SSE subscriber.
 */
export function validateContentSafeRefreshEventV1(
  input: unknown,
): ContentSafeRefreshEventV1 | undefined {
  if (!isRecord(input) || !hasExactKeys(input, EVENT_KEYS)) return undefined;

  const sequence = input['sequence'];
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence <= 0) {
    return undefined;
  }

  const tenantScope = parseTenantScopeV1(input['tenantScope']);
  if (!tenantScope.accepted) return undefined;

  const dashboardId = safeIdentifier(input['dashboardId']);
  const snapshotId = safeIdentifier(input['snapshotId']);
  if (dashboardId === undefined || snapshotId === undefined) return undefined;

  const freshnessState = input['freshnessState'];
  if (
    typeof freshnessState !== 'string' ||
    !FRESHNESS_STATES.has(freshnessState as ContentSafeRefreshEventV1['freshnessState'])
  ) {
    return undefined;
  }

  const eventHash = safeHash(input['eventHash']);
  if (eventHash === undefined) return undefined;

  const occurredAt = parseStrictUtcTimestampV1(input['occurredAt']);
  if (!occurredAt.accepted) return undefined;

  return Object.freeze({
    sequence,
    tenantScope: tenantScope.value,
    dashboardId,
    snapshotId,
    freshnessState: freshnessState as ContentSafeRefreshEventV1['freshnessState'],
    eventHash,
    occurredAt: occurredAt.value,
  });
}

function normalizeAppendInput(
  input: ContentSafeRefreshEventV1 | RefreshEventAppendInputV1,
): RefreshEventAppendInputV1 | undefined {
  if (isRecord(input) && 'eventKind' in input) return validateAppendInput(input);
  const contentSafe = validateContentSafeRefreshEventV1(input);
  if (contentSafe === undefined) return undefined;
  return Object.freeze({
    eventId: contentSafe.snapshotId,
    tenantScope: contentSafe.tenantScope,
    dashboardId: contentSafe.dashboardId,
    snapshotId: contentSafe.snapshotId,
    freshnessState: contentSafe.freshnessState,
    eventHash: contentSafe.eventHash,
    occurredAt: contentSafe.occurredAt,
    eventKind: 'SNAPSHOT_COMMITTED',
    correlationId: contentSafe.snapshotId,
    metadata: Object.freeze({}),
  });
}

function validateDurableRecord(input: unknown): DurableRefreshEventRecordV1 | undefined {
  if (!isRecord(input)) return undefined;
  const sequence = input['sequence'];
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence <= 0) {
    return undefined;
  }
  const eventId = safeIdentifier(input['eventId']);
  if (eventId === undefined) return undefined;
  const append = validateAppendInput(input);
  if (append === undefined) return undefined;
  return Object.freeze({
    ...append,
    eventId,
    sequence,
    metadata: append.metadata as ContentSafeRefreshMetadataV1,
  });
}

function toContentSafe(record: DurableRefreshEventRecordV1): ContentSafeRefreshEventV1 {
  return Object.freeze({
    sequence: record.sequence,
    tenantScope: record.tenantScope,
    dashboardId: record.dashboardId,
    snapshotId: record.snapshotId,
    freshnessState: record.freshnessState,
    eventHash: record.eventHash,
    occurredAt: record.occurredAt,
  });
}

export interface RefreshEventStreamSubscriptionV1 {
  readonly replay: readonly ContentSafeRefreshEventV1[];
  readonly highestSequence: number;
  readonly oldestSequence?: number;
  readonly hasMore?: boolean;
  readonly unsubscribe: () => void;
}

type RefreshEventListenerV1 = (event: ContentSafeRefreshEventV1) => void;

interface RefreshEventListenerRegistrationV1 {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly listener: RefreshEventListenerV1;
}

export interface RefreshEventBusListResultV1 {
  readonly events: readonly ContentSafeRefreshEventV1[];
  readonly highestSequence: number;
  readonly oldestSequence?: number;
  readonly hasMore?: boolean;
}

/** In-memory committed-event bus for content-safe SSE hints (DDA-034). */
export class RefreshEventBus {
  readonly #events: ContentSafeRefreshEventV1[] = [];
  readonly #listeners = new Set<RefreshEventListenerRegistrationV1>();

  public get listenerCount(): number {
    return this.#listeners.size;
  }

  public publish(
    event: ContentSafeRefreshEventV1 | RefreshEventAppendInputV1,
  ): void | Promise<void> {
    const normalized = normalizeAppendInput(event);
    if (normalized === undefined) throw new Error('INVALID_REFRESH_EVENT');
    const sequence = 'sequence' in event && typeof event.sequence === 'number' ? event.sequence : 0;
    if (sequence <= 0) throw new Error('INVALID_REFRESH_EVENT');
    const validated = validateContentSafeRefreshEventV1({
      sequence,
      tenantScope: normalized.tenantScope,
      dashboardId: normalized.dashboardId,
      snapshotId: normalized.snapshotId,
      freshnessState: normalized.freshnessState,
      eventHash: normalized.eventHash,
      occurredAt: normalized.occurredAt,
    });
    if (validated === undefined) throw new Error('INVALID_REFRESH_EVENT');

    this.#events.push(validated);
    if (this.#events.length > MAX_RETAINED_REFRESH_EVENTS) this.#events.shift();

    for (const registration of [...this.#listeners]) {
      if (
        registration.dashboardId !== validated.dashboardId ||
        tenantScopeKeyV1(registration.tenantScope) !== tenantScopeKeyV1(validated.tenantScope)
      ) {
        continue;
      }
      try {
        registration.listener(validated);
      } catch {
        // A subscriber must not be able to break committed-event publication for other tenants.
      }
    }
  }

  public listenFor(
    input: {
      readonly tenantScope: TenantScopeV1;
      readonly dashboardId: string;
      readonly cursor: number;
    },
    listener: RefreshEventListenerV1,
    _onError?: () => void,
  ): RefreshEventStreamSubscriptionV1 | Promise<RefreshEventStreamSubscriptionV1> {
    void _onError;
    const registration: RefreshEventListenerRegistrationV1 = {
      tenantScope: input.tenantScope,
      dashboardId: input.dashboardId,
      listener,
    };
    this.#listeners.add(registration);
    const listed = this.listFor(input);
    if (listed instanceof Promise) throw new Error('REFRESH_EVENT_BUS_ASYNC_LIST_UNSUPPORTED');
    let active = true;
    return Object.freeze({
      replay: listed.events,
      highestSequence: listed.highestSequence,
      ...(listed.oldestSequence === undefined ? {} : { oldestSequence: listed.oldestSequence }),
      ...(listed.hasMore === undefined ? {} : { hasMore: listed.hasMore }),
      unsubscribe: () => {
        if (!active) return;
        active = false;
        this.#listeners.delete(registration);
      },
    });
  }

  public listFor(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly cursor: number;
  }): RefreshEventBusListResultV1 | Promise<RefreshEventBusListResultV1> {
    const scoped = this.#events.filter(
      (event) =>
        event.dashboardId === input.dashboardId &&
        tenantScopeKeyV1(event.tenantScope) === tenantScopeKeyV1(input.tenantScope),
    );
    const highestSequence = scoped.reduce((max, event) => Math.max(max, event.sequence), 0);
    const afterCursor = scoped.filter((event) => event.sequence > input.cursor);
    const events =
      afterCursor.length > MAX_REFRESH_EVENT_REPLAY_V1
        ? afterCursor.slice(-MAX_REFRESH_EVENT_REPLAY_V1)
        : afterCursor;
    return Object.freeze({ events: Object.freeze(events), highestSequence });
  }
}

export interface DurableRefreshEventBusOptionsV1 {
  readonly pollIntervalMs?: number;
  readonly pageSize?: number;
}

/**
 * PostgreSQL-backed refresh event delivery. The store is the source of truth; this object only
 * polls it to wake local SSE subscribers and therefore remains safe across API restarts/tasks.
 */
export class DurableRefreshEventBus extends RefreshEventBus {
  readonly #store: RefreshEventDurableStoreV1;
  readonly #pollIntervalMs: number;
  readonly #pageSize: number;
  #activeSubscriptions = 0;

  public constructor(
    store: RefreshEventDurableStoreV1,
    options: DurableRefreshEventBusOptionsV1 = {},
  ) {
    super();
    this.#store = store;
    this.#pollIntervalMs = Math.max(
      1,
      Math.min(options.pollIntervalMs ?? 1_000, MAX_REFRESH_EVENT_POLL_INTERVAL_MS),
    );
    this.#pageSize = Math.max(
      1,
      Math.min(options.pageSize ?? MAX_REFRESH_EVENT_REPLAY_V1, MAX_REFRESH_EVENT_REPLAY_V1),
    );
  }

  public get activeSubscriptionCount(): number {
    return this.#activeSubscriptions;
  }

  public override get listenerCount(): number {
    return this.#activeSubscriptions;
  }

  public override async publish(
    event: ContentSafeRefreshEventV1 | RefreshEventAppendInputV1,
  ): Promise<void> {
    const normalized = normalizeAppendInput(event);
    if (normalized === undefined) throw new Error('INVALID_REFRESH_EVENT');
    const withEventId =
      normalized.eventId === undefined
        ? Object.freeze({ ...normalized, eventId: randomUUID() })
        : normalized;
    const stored = await this.#store.append(withEventId);
    if (validateDurableRecord(stored) === undefined) {
      throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
    }
  }

  public override async listFor(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly cursor: number;
  }): Promise<RefreshEventBusListResultV1> {
    const page = await this.#store.list({ ...input, limit: this.#pageSize });
    if (
      !Number.isSafeInteger(page.highestSequence) ||
      page.highestSequence < 0 ||
      !Number.isSafeInteger(page.oldestSequence) ||
      page.oldestSequence < 0 ||
      !Array.isArray(page.events) ||
      page.events.length > this.#pageSize ||
      typeof page.hasMore !== 'boolean'
    ) {
      throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
    }
    const bySequence = new Map<number, ContentSafeRefreshEventV1>();
    for (const row of page.events) {
      const validated = validateDurableRecord(row);
      if (validated === undefined) throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
      if (
        validated.dashboardId !== input.dashboardId ||
        tenantScopeKeyV1(validated.tenantScope) !== tenantScopeKeyV1(input.tenantScope)
      ) {
        throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
      }
      const projected = toContentSafe(validated);
      const prior = bySequence.get(projected.sequence);
      if (prior !== undefined && prior.eventHash !== projected.eventHash) {
        throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
      }
      bySequence.set(projected.sequence, projected);
    }
    const events = [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
    return Object.freeze({
      events: Object.freeze(events),
      highestSequence: page.highestSequence,
      oldestSequence: page.oldestSequence,
      hasMore: page.hasMore,
    });
  }

  public override async listenFor(
    input: {
      readonly tenantScope: TenantScopeV1;
      readonly dashboardId: string;
      readonly cursor: number;
    },
    listener: RefreshEventListenerV1,
    onError?: () => void,
  ): Promise<RefreshEventStreamSubscriptionV1> {
    const initial = await this.listFor(input);
    let active = true;
    let cursor = input.cursor;
    let pollInFlight = false;
    const seen = new Set<number>();
    for (const event of initial.events) {
      seen.add(event.sequence);
      cursor = Math.max(cursor, event.sequence);
    }

    const unsubscribe = (): void => {
      if (!active) return;
      active = false;
      if (timer !== undefined) clearInterval(timer);
      this.#activeSubscriptions = Math.max(0, this.#activeSubscriptions - 1);
    };

    const fail = (): void => {
      const wasActive = active;
      unsubscribe();
      if (wasActive) {
        try {
          onError?.();
        } catch {
          // Subscriber cleanup must not keep a failed polling loop alive.
        }
      }
    };

    const poll = async (): Promise<void> => {
      if (!active || pollInFlight) return;
      pollInFlight = true;
      try {
        const page = await this.listFor({ ...input, cursor });
        for (const event of page.events) {
          if (!active || event.sequence <= cursor || seen.has(event.sequence)) continue;
          seen.add(event.sequence);
          cursor = Math.max(cursor, event.sequence);
          listener(event);
        }
        if (seen.size > MAX_RETAINED_REFRESH_EVENTS) {
          const floor = cursor - MAX_RETAINED_REFRESH_EVENTS;
          for (const sequence of seen) if (sequence < floor) seen.delete(sequence);
        }
      } catch {
        fail();
      } finally {
        pollInFlight = false;
      }
    };

    this.#activeSubscriptions += 1;
    const timer = setInterval(() => void poll(), this.#pollIntervalMs);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      timer.unref();
    }

    return Object.freeze({
      replay: initial.events,
      highestSequence: initial.highestSequence,
      ...(initial.oldestSequence === undefined ? {} : { oldestSequence: initial.oldestSequence }),
      ...(initial.hasMore === undefined ? {} : { hasMore: initial.hasMore }),
      unsubscribe,
    });
  }
}
