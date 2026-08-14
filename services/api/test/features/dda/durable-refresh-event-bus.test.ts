import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DurableRefreshEventBus,
  type ContentSafeRefreshMetadataV1,
  type DurableRefreshEventRecordV1,
  type RefreshEventDurableStoreV1,
  type RefreshEventAppendInputV1,
} from '../../../src/features/dda/refresh/application/refresh-event-bus.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const foreignScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000091',
  workspaceId: '00000000-0000-4000-8000-000000000092',
  projectId: '00000000-0000-4000-8000-000000000093',
});
assert.equal(foreignScopeResult.accepted, true);
const foreignScope = foreignScopeResult.accepted ? foreignScopeResult.value : (null as never);

const dashboardId = '00000000-0000-4000-8000-000000000601';
const otherDashboardId = '00000000-0000-4000-8000-000000000602';

function id(suffix: number): string {
  return `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
}

function appendInput(
  sequence: number,
  overrides: Partial<RefreshEventAppendInputV1> = {},
): RefreshEventAppendInputV1 {
  return {
    tenantScope: scope,
    dashboardId,
    snapshotId: id(0x700 + sequence),
    freshnessState: 'FRESH',
    eventHash: sequence.toString(16).padStart(64, '0'),
    occurredAt: new Date(Date.UTC(2026, 7, 13, 0, 0, sequence)).toISOString(),
    eventKind: 'SNAPSHOT_COMMITTED',
    correlationId: id(0x800 + sequence),
    authorizationEpoch: 7,
    metadata: { refreshId: id(0x900 + sequence), dashboardVersionId: id(0xa00 + sequence) },
    ...overrides,
  };
}

function scopeKey(input: {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
}): string {
  return [input.organizationId, input.workspaceId ?? '', input.projectId ?? ''].join('|');
}

class SharedDurableStore implements RefreshEventDurableStoreV1 {
  public readonly rows: DurableRefreshEventRecordV1[] = [];
  public failReads = false;
  public failWrites = false;
  private readonly nextSequence = new Map<string, number>();

  public async append(input: RefreshEventAppendInputV1): Promise<DurableRefreshEventRecordV1> {
    await Promise.resolve();
    if (this.failWrites) throw new Error('STORE_WRITE_OUTAGE');
    const duplicate = this.rows.find(
      (row) =>
        row.eventHash === input.eventHash &&
        row.dashboardId === input.dashboardId &&
        scopeKey(row.tenantScope) === scopeKey(input.tenantScope),
    );
    if (duplicate) return duplicate;

    const key = `${scopeKey(input.tenantScope)}|${input.dashboardId}`;
    const sequence = this.nextSequence.get(key) ?? 1;
    this.nextSequence.set(key, sequence + 1);
    const row: DurableRefreshEventRecordV1 = Object.freeze({
      eventId: input.eventId ?? id(0xb00 + sequence),
      sequence,
      ...input,
      metadata: input.metadata as ContentSafeRefreshMetadataV1,
    });
    this.rows.push(row);
    return row;
  }

  public async list(input: {
    readonly tenantScope: typeof scope;
    readonly dashboardId: string;
    readonly cursor: number;
    readonly limit: number;
  }) {
    await Promise.resolve();
    if (this.failReads) throw new Error('STORE_READ_OUTAGE');
    const scoped = this.rows
      .filter(
        (row) =>
          row.dashboardId === input.dashboardId &&
          scopeKey(row.tenantScope) === scopeKey(input.tenantScope),
      )
      .sort((left, right) => left.sequence - right.sequence);
    const afterCursor = scoped.filter((row) => row.sequence > input.cursor);
    return {
      events: afterCursor.slice(0, input.limit),
      highestSequence: scoped.at(-1)?.sequence ?? 0,
      oldestSequence: scoped.at(0)?.sequence ?? 0,
      hasMore: afterCursor.length > input.limit,
    };
  }
}

function waitFor(predicate: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 500;
    const check = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('timed out waiting for durable refresh event'));
        return;
      }
      setTimeout(check, 2);
    };
    check();
  });
}

void test('[DDA-034][DDA-036] separate bus instances share durable events and replay after restart', async () => {
  const store = new SharedDurableStore();
  const first = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });
  const second = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });

  await first.publish(appendInput(1));
  const replay = await second.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    replay.events.map((event) => event.sequence),
    [1],
  );

  const restarted = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });
  const afterRestart = await restarted.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    afterRestart.events.map((event) => event.snapshotId),
    [id(0x701)],
  );
});

void test('[DDA-034] concurrent publishes allocate one monotonic sequence per dashboard', async () => {
  const store = new SharedDurableStore();
  const first = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });
  const second = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      (index % 2 === 0 ? first : second).publish(appendInput(index + 1)),
    ),
  );

  const listed = await first.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    listed.events.map((event) => event.sequence),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  assert.equal(new Set(listed.events.map((event) => event.sequence)).size, 12);
});

void test('[DDA-026][DDA-034] durable listing cannot cross tenant or dashboard scope', async () => {
  const store = new SharedDurableStore();
  const bus = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });
  await bus.publish(appendInput(1));
  await bus.publish(appendInput(2, { tenantScope: foreignScope }));
  await bus.publish(appendInput(3, { dashboardId: otherDashboardId }));

  const owned = await bus.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    owned.events.map((event) => event.sequence),
    [1],
  );
});

void test('[DDA-034] durable rows reject unsafe bounded metadata and corrupt replay rows', async () => {
  const store = new SharedDurableStore();
  const bus = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });

  await assert.rejects(
    bus.publish(
      appendInput(1, {
        metadata: { cellValue: 'must-not-persist' },
      }),
    ),
    /INVALID_REFRESH_EVENT/u,
  );

  await bus.publish(appendInput(1));
  assert.equal('cellValue' in store.rows[0]!.metadata, false);
  assert.equal('path' in store.rows[0]!.metadata, false);

  store.rows[0] = { ...store.rows[0]!, metadata: { providerResponse: 'unsafe' } };
  await assert.rejects(
    bus.listFor({ tenantScope: scope, dashboardId, cursor: 0 }),
    /DDA_REFRESH_EVENT_STORE_CORRUPT/u,
  );
});

void test('[DDA-034] durable polling suppresses duplicate rows and exposes bounded replay gaps', async () => {
  const store = new SharedDurableStore();
  const bus = new DurableRefreshEventBus(store, { pollIntervalMs: 2, pageSize: 2 });
  await bus.publish(appendInput(1));
  await bus.publish(appendInput(2));
  await bus.publish(appendInput(3));

  const page = await bus.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    page.events.map((event) => event.sequence),
    [1, 2],
  );
  assert.equal(page.hasMore, true);

  store.rows.splice(1, 1);
  const gap = await bus.listFor({ tenantScope: scope, dashboardId, cursor: 0 });
  assert.deepEqual(
    gap.events.map((event) => event.sequence),
    [1, 3],
  );
  assert.equal(gap.highestSequence, 3);
});

void test('[DDA-034] durable polling cancels cleanly and terminates on persistence outage', async () => {
  const store = new SharedDurableStore();
  const bus = new DurableRefreshEventBus(store, { pollIntervalMs: 2 });
  const received: number[] = [];
  let outage = false;
  const subscription = await bus.listenFor(
    { tenantScope: scope, dashboardId, cursor: 0 },
    (event) => received.push(event.sequence),
    () => {
      outage = true;
    },
  );
  assert.equal(bus.activeSubscriptionCount, 1);

  subscription.unsubscribe();
  assert.equal(bus.activeSubscriptionCount, 0);
  await bus.publish(appendInput(1));
  await new Promise<void>((resolve) => setTimeout(resolve, 8));
  assert.deepEqual(received, []);

  const outageSubscription = await bus.listenFor(
    { tenantScope: scope, dashboardId, cursor: 0 },
    () => undefined,
    () => undefined,
  );
  store.failReads = true;
  await waitFor(() => bus.activeSubscriptionCount === 1);
  await waitFor(() => bus.activeSubscriptionCount === 0);
  outageSubscription.unsubscribe();
  assert.equal(outage, false);
});
