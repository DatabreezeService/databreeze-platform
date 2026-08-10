import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export interface ContentSafeRefreshEventV1 {
  readonly sequence: number;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly freshnessState: 'FRESH' | 'STALE' | 'PENDING' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
  readonly eventHash: string;
  readonly occurredAt: string;
}

function scopeKey(tenantScope: TenantScopeV1): string {
  const workspaceId = 'workspaceId' in tenantScope ? (tenantScope.workspaceId ?? '') : '';
  const projectId = 'projectId' in tenantScope ? (tenantScope.projectId ?? '') : '';
  return [tenantScope.scopeType, tenantScope.organizationId, workspaceId, projectId].join('|');
}

/** In-memory committed-event bus for content-safe SSE hints (DDA-034). */
export class RefreshEventBus {
  readonly #events: ContentSafeRefreshEventV1[] = [];

  public publish(event: ContentSafeRefreshEventV1): void {
    this.#events.push(
      Object.freeze({
        sequence: event.sequence,
        tenantScope: event.tenantScope,
        dashboardId: event.dashboardId,
        snapshotId: event.snapshotId,
        freshnessState: event.freshnessState,
        eventHash: event.eventHash,
        occurredAt: event.occurredAt,
      }),
    );
  }

  public listFor(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly cursor: number;
  }): {
    readonly events: readonly ContentSafeRefreshEventV1[];
    readonly highestSequence: number;
  } {
    const scoped = this.#events.filter(
      (event) =>
        event.dashboardId === input.dashboardId &&
        scopeKey(event.tenantScope) === scopeKey(input.tenantScope),
    );
    const highestSequence = scoped.reduce((max, event) => Math.max(max, event.sequence), 0);
    const deduped = new Map<number, ContentSafeRefreshEventV1>();
    for (const event of scoped) {
      if (event.sequence <= input.cursor) continue;
      deduped.set(event.sequence, event);
    }
    const events = [...deduped.values()].sort((left, right) => left.sequence - right.sequence);
    return Object.freeze({ events: Object.freeze(events), highestSequence });
  }
}
