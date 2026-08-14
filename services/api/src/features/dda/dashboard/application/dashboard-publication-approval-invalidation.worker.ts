import { DashboardPublicationApprovalInvalidationDispatcherV1 } from './dashboard-publication-approval-invalidation.dispatcher.js';
import type { DashboardPublicationApprovalInvalidationOutboxPortV1 } from './dashboard-publication-approval-invalidation-outbox.port.js';

interface WorkerOptionsV1 {
  readonly workerId: string;
  readonly pollIntervalMs?: number;
  readonly leaseDurationMs?: number;
  readonly retryDelayMs?: number;
  readonly maxScopesPerPoll?: number;
  readonly clock?: () => Date;
}

/**
 * DDA-025/AUD-003: one bounded process-local scheduler for durable invalidation rows.
 * Tenant scope is discovered from the outbox, but every claim and completion remains
 * exact-scope and lease guarded. The timer is lifecycle-owned so shutdown cannot leave
 * a live retry loop behind.
 */
export class DashboardPublicationApprovalInvalidationWorkerV1 {
  readonly #outbox: Pick<
    DashboardPublicationApprovalInvalidationOutboxPortV1,
    'listPendingTenantScopes'
  >;
  readonly #dispatcher: Pick<DashboardPublicationApprovalInvalidationDispatcherV1, 'dispatchNext'>;
  readonly #workerId: string;
  readonly #pollIntervalMs: number;
  readonly #leaseDurationMs: number;
  readonly #retryDelayMs: number;
  readonly #maxScopesPerPoll: number;
  readonly #clock: () => Date;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #stopped = true;

  public constructor(
    outbox: Pick<DashboardPublicationApprovalInvalidationOutboxPortV1, 'listPendingTenantScopes'>,
    dispatcher: Pick<DashboardPublicationApprovalInvalidationDispatcherV1, 'dispatchNext'>,
    options: WorkerOptionsV1,
  ) {
    this.#outbox = outbox;
    this.#dispatcher = dispatcher;
    this.#workerId = options.workerId;
    this.#pollIntervalMs = boundedPositive(options.pollIntervalMs ?? 5_000, 1, 60_000);
    this.#leaseDurationMs = boundedPositive(options.leaseDurationMs ?? 60_000, 1_000, 300_000);
    this.#retryDelayMs = boundedPositive(options.retryDelayMs ?? 5_000, 0, 300_000);
    this.#maxScopesPerPoll = boundedPositive(options.maxScopesPerPoll ?? 16, 1, 64);
    this.#clock = options.clock ?? (() => new Date());
  }

  public onModuleInit(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#schedule(0);
  }

  public async onModuleDestroy(): Promise<void> {
    this.#stopped = true;
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    while (this.#running) await Promise.resolve();
  }

  public async runOnce(now = this.#clock()): Promise<void> {
    const scopes = await this.#outbox.listPendingTenantScopes({
      now,
      limit: this.#maxScopesPerPoll,
    });
    for (const tenantScope of scopes.slice(0, this.#maxScopesPerPoll)) {
      await this.#dispatcher.dispatchNext({
        tenantScope,
        workerId: this.#workerId,
        now,
        leaseDurationMs: this.#leaseDurationMs,
        retryDelayMs: this.#retryDelayMs,
      });
    }
  }

  #schedule(delayMs: number): void {
    if (this.#stopped || this.#timer !== undefined) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#tick();
    }, delayMs);
  }

  async #tick(): Promise<void> {
    if (this.#stopped || this.#running) return;
    this.#running = true;
    try {
      await this.runOnce();
    } catch {
      // The durable row remains pending/leased; the next bounded poll retries it.
    } finally {
      this.#running = false;
      this.#schedule(this.#pollIntervalMs);
    }
  }
}

function boundedPositive(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}
