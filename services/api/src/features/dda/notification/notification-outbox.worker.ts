import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { NotificationOutboxConsumerV1 } from './notification-outbox.consumer.js';

export const DDA_NOTIFICATION_OUTBOX_WORKER = Symbol('DDA_NOTIFICATION_OUTBOX_WORKER');

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const DEFAULT_SCOPE_LIMIT = 16;
const DEFAULT_BATCH_LIMIT = 50;
const MAX_SCOPE_LIMIT = 64;
const MAX_BATCH_LIMIT = 50;

export interface NotificationOutboxScopeV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
}

export interface NotificationOutboxScopePortV1 {
  listPendingScopes(input: {
    readonly limit: number;
  }): Promise<
    | { readonly accepted: true; readonly scopes: readonly NotificationOutboxScopeV1[] }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  >;
}

export interface NotificationOutboxTimerPortV1 {
  setTimeout(callback: () => void | Promise<void>, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NotificationOutboxWorkerOptionsV1 {
  readonly workerId?: string;
  readonly pollIntervalMs?: number;
  readonly retryBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly leaseDurationMs?: number;
  readonly scopeLimit?: number;
  readonly batchLimit?: number;
  readonly clock?: () => number;
  readonly timer?: NotificationOutboxTimerPortV1;
}

export type NotificationOutboxWorkerResultV1 =
  | {
      readonly accepted: true;
      readonly processedScopes: number;
      readonly deliveredCount: number;
      readonly hasMore: boolean;
    }
  | { readonly accepted: false; readonly code: 'CONFLICT' | 'LEASE_CONFLICT' | 'UNAVAILABLE' };

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(code);
  }
  return resolved;
}

function defaultTimer(): NotificationOutboxTimerPortV1 {
  return {
    setTimeout: (callback, delayMs) =>
      setTimeout(() => {
        void callback();
      }, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

function validScope(scope: NotificationOutboxScopeV1): boolean {
  return (
    parseStableIdentifierV1(scope.organizationId).accepted &&
    parseStableIdentifierV1(scope.workspaceId).accepted
  );
}

/** Bounded production scheduler for the durable, checkpointed notification projection. */
export class NotificationOutboxProjectionWorkerV1 {
  public readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly retryBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly leaseDurationMs: number;
  private readonly scopeLimit: number;
  private readonly batchLimit: number;
  private readonly clock: () => number;
  private readonly timer: NotificationOutboxTimerPortV1;
  private timerHandle: unknown;
  private activeRun: Promise<NotificationOutboxWorkerResultV1> | undefined;
  private leaseUntil = 0;
  private retryCount = 0;
  private initialized = false;
  private stopped = false;

  public constructor(
    private readonly scopes: NotificationOutboxScopePortV1,
    private readonly consumer: Pick<NotificationOutboxConsumerV1, 'runOnce'>,
    options: NotificationOutboxWorkerOptionsV1 = {},
  ) {
    this.workerId = options.workerId ?? 'dda-notification-outbox-worker';
    if (
      this.workerId.length === 0 ||
      this.workerId.length > 128 ||
      [...this.workerId].some((character) => (character.codePointAt(0) ?? 0) <= 31)
    ) {
      throw new Error('DDA_NOTIFICATION_OUTBOX_WORKER_ID_INVALID');
    }
    this.pollIntervalMs = boundedInteger(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      1,
      60_000,
      'DDA_NOTIFICATION_OUTBOX_POLL_INTERVAL_INVALID',
    );
    this.retryBackoffMs = boundedInteger(
      options.retryBackoffMs,
      DEFAULT_RETRY_BACKOFF_MS,
      1,
      60_000,
      'DDA_NOTIFICATION_OUTBOX_RETRY_BACKOFF_INVALID',
    );
    this.maxBackoffMs = boundedInteger(
      options.maxBackoffMs,
      DEFAULT_MAX_BACKOFF_MS,
      this.retryBackoffMs,
      300_000,
      'DDA_NOTIFICATION_OUTBOX_MAX_BACKOFF_INVALID',
    );
    this.leaseDurationMs = boundedInteger(
      options.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
      1,
      300_000,
      'DDA_NOTIFICATION_OUTBOX_LEASE_INVALID',
    );
    this.scopeLimit = boundedInteger(
      options.scopeLimit,
      DEFAULT_SCOPE_LIMIT,
      1,
      MAX_SCOPE_LIMIT,
      'DDA_NOTIFICATION_OUTBOX_SCOPE_LIMIT_INVALID',
    );
    this.batchLimit = boundedInteger(
      options.batchLimit,
      DEFAULT_BATCH_LIMIT,
      1,
      MAX_BATCH_LIMIT,
      'DDA_NOTIFICATION_OUTBOX_BATCH_LIMIT_INVALID',
    );
    this.clock = options.clock ?? Date.now;
    this.timer = options.timer ?? defaultTimer();
  }

  /** Nest calls this hook only when the worker was composed by production DDA wiring. */
  public onModuleInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.stopped = false;
    this.schedule(0);
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.clearScheduledRun();
    const activeRun = this.activeRun;
    if (activeRun !== undefined) await activeRun;
  }

  public async runOnce(): Promise<NotificationOutboxWorkerResultV1> {
    if (this.stopped) return { accepted: false, code: 'UNAVAILABLE' };
    const now = this.clock();
    if (this.activeRun !== undefined || now < this.leaseUntil) {
      return { accepted: false, code: 'LEASE_CONFLICT' };
    }

    this.leaseUntil = now + this.leaseDurationMs;
    const run = this.runLeased();
    this.activeRun = run;
    try {
      return await run;
    } finally {
      if (this.activeRun === run) this.activeRun = undefined;
      this.leaseUntil = 0;
    }
  }

  private async runLeased(): Promise<NotificationOutboxWorkerResultV1> {
    try {
      const scopeResult = await this.scopes.listPendingScopes({ limit: this.scopeLimit });
      if (scopeResult.accepted === false) return scopeResult;
      const uniqueScopes: NotificationOutboxScopeV1[] = [];
      const seen = new Set<string>();
      for (const scope of scopeResult.scopes) {
        if (!validScope(scope)) return { accepted: false, code: 'UNAVAILABLE' };
        const key = `${scope.organizationId}:${scope.workspaceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueScopes.push(scope);
        if (uniqueScopes.length === this.scopeLimit) break;
      }

      let deliveredCount = 0;
      let hasMore = false;
      for (const scope of uniqueScopes) {
        const result = await this.consumer.runOnce({
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          limit: this.batchLimit,
        });
        if (result.accepted === false) return result;
        deliveredCount += result.deliveredCount;
        hasMore ||= result.hasMore;
      }
      return {
        accepted: true,
        processedScopes: uniqueScopes.length,
        deliveredCount,
        hasMore,
      };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.clearScheduledRun();
    this.timerHandle = this.timer.setTimeout(() => this.tick(), delayMs);
  }

  private clearScheduledRun(): void {
    if (this.timerHandle === undefined) return;
    this.timer.clearTimeout(this.timerHandle);
    this.timerHandle = undefined;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const result = await this.runOnce();
    if (this.stopped) return;
    if (result.accepted) {
      this.retryCount = 0;
      this.schedule(this.pollIntervalMs);
      return;
    }
    this.retryCount = Math.min(this.retryCount + 1, 31);
    const backoff = Math.min(
      this.maxBackoffMs,
      this.retryBackoffMs * 2 ** Math.max(0, this.retryCount - 1),
    );
    this.schedule(backoff);
  }
}
