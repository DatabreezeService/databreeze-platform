import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, ForbiddenException, type MessageEvent } from '@nestjs/common';
import { isObservable, type Observable } from 'rxjs';
import { firstValueFrom, take } from 'rxjs';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { DashboardRefreshEventsController } from '../../../src/features/dda/refresh/api/dashboard-refresh-events.controller.js';
import {
  RefreshEventBus,
  type ContentSafeRefreshEventV1,
} from '../../../src/features/dda/refresh/application/refresh-event-bus.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

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

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dashboard-refresh-events',
});
assert.equal(contextResult.accepted, true);
const context = contextResult.accepted ? contextResult.value : (null as never);

const dashboardId = '00000000-0000-4000-8000-000000000601';

function requestContext(): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(context) };
}

function authorization(allowed = true): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction(input) {
      assert.equal(input.tenantScope, context.tenantScope);
      assert.equal(input.actorId, context.actorId);
      assert.equal(input.dashboardId, dashboardId);
      assert.equal(input.action, 'SUBSCRIBE');
      return Promise.resolve(Object.freeze({ allowed, grantsDatasetAccess: false }));
    },
    projectVisibleFields: () => Promise.resolve(Object.freeze([])),
  };
}

function controllableAuthorization(initialAllowed = true): {
  readonly port: DashboardAuthorizationPortV1;
  readonly calls: readonly number[];
  setAllowed(value: boolean): void;
} {
  let allowed = initialAllowed;
  const calls: number[] = [];
  return {
    calls,
    setAllowed(value) {
      allowed = value;
    },
    port: {
      authorizeDashboardAction(input) {
        calls.push(1);
        assert.equal(input.tenantScope, context.tenantScope);
        assert.equal(input.actorId, context.actorId);
        assert.equal(input.dashboardId, dashboardId);
        assert.equal(input.action, 'SUBSCRIBE');
        return Promise.resolve(Object.freeze({ allowed, grantsDatasetAccess: false }));
      },
      projectVisibleFields: () => Promise.resolve(Object.freeze([])),
    },
  };
}

function identifier(suffix: number): string {
  return `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
}

function refreshEvent(
  sequence: number,
  overrides: Partial<ContentSafeRefreshEventV1> = {},
): ContentSafeRefreshEventV1 {
  return {
    sequence,
    tenantScope: scope,
    dashboardId,
    snapshotId: identifier(0x602 + sequence),
    freshnessState: 'FRESH',
    eventHash: (sequence % 16).toString(16).repeat(64),
    occurredAt: new Date(Date.UTC(2026, 7, 13, 0, 0, sequence)).toISOString(),
    ...overrides,
  };
}

function asObservable(value: unknown): Observable<MessageEvent> {
  assert.equal(isObservable(value), true);
  return value as Observable<MessageEvent>;
}

function listenerCount(bus: RefreshEventBus): number {
  return (bus as unknown as { readonly listenerCount: number }).listenerCount;
}

class MalformedReplayBus extends RefreshEventBus {
  public constructor(private readonly malformed: unknown) {
    super();
  }

  public override listenFor(
    input: Parameters<RefreshEventBus['listenFor']>[0],
    listener: Parameters<RefreshEventBus['listenFor']>[1],
  ): ReturnType<RefreshEventBus['listenFor']> {
    void input;
    void listener;
    return {
      replay: [this.malformed as ContentSafeRefreshEventV1],
      highestSequence: 1,
      unsubscribe: () => undefined,
    };
  }
}

function collect(stream: Observable<MessageEvent>): Promise<MessageEvent[]> {
  return new Promise((resolve, reject) => {
    const values: MessageEvent[] = [];
    stream.subscribe({
      next: (value) => values.push(value),
      error: reject,
      complete: () => resolve(values),
    });
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail('timed out waiting for refresh event stream state');
}

void test('[DDA-034] refresh events expose Nest SSE metadata and an Observable stream', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());

  const stream = await controller.subscribe({ query: {} }, dashboardId, '0');
  const subscribeMethod = Object.getOwnPropertyDescriptor(
    DashboardRefreshEventsController.prototype,
    'subscribe',
  )?.value as object | undefined;

  assert.ok(subscribeMethod);
  assert.equal(Reflect.getMetadata('__sse__', subscribeMethod), true);
  assert.equal(isObservable(stream), true);
});

void test('[DDA-034] SSE replays only authorized content-safe committed events', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());
  const owned = refreshEvent(1);
  void bus.publish(owned);
  void bus.publish({ ...refreshEvent(2), tenantScope: foreignScope });

  const stream = asObservable(await controller.subscribe({ query: {} }, dashboardId, '0'));
  const message = await firstValueFrom(stream.pipe(take(1)));

  assert.deepEqual(message, {
    id: '1',
    type: 'dashboard-refresh',
    data: {
      sequence: 1,
      dashboardId,
      snapshotId: owned.snapshotId,
      freshnessState: 'FRESH',
      eventHash: '1'.repeat(64),
      occurredAt: '2026-08-13T00:00:01.000Z',
    },
  });
  assert.equal('tenantScope' in (message.data as Record<string, unknown>), false);
  assert.doesNotMatch(JSON.stringify(message), /amount|OCR|filename|sourceValue/u);
});

void test('[DDA-034] replay gaps emit reconciliation before any state and then close', async () => {
  const cases: readonly {
    readonly name: string;
    readonly cursor: string;
    readonly sequences: number[];
  }[] = [
    { name: 'first retained sequence after cursor zero', cursor: '0', sequences: [2] },
    { name: 'internal gap', cursor: '0', sequences: [1, 3] },
    { name: 'internal gap after cursor', cursor: '1', sequences: [2, 4] },
    { name: 'duplicate sequence', cursor: '0', sequences: [1, 1] },
    { name: 'out of order delivery', cursor: '0', sequences: [1, 2, 1] },
    { name: 'cursor beyond highest with retention', cursor: '2', sequences: [1] },
    { name: 'cursor beyond highest with empty retention', cursor: '1', sequences: [] },
    {
      name: 'bounded replay truncation',
      cursor: '0',
      sequences: Array.from({ length: 101 }, (_, index) => index + 1),
    },
  ];

  for (const current of cases) {
    const bus = new RefreshEventBus();
    const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());
    for (const sequence of current.sequences) void bus.publish(refreshEvent(sequence));

    const messages = await collect(
      asObservable(await controller.subscribe({ query: {} }, dashboardId, current.cursor)),
    );

    assert.deepEqual(
      messages,
      [
        {
          type: 'dashboard-refresh-reconcile',
          data: { reconcileViaRest: true, reasonCode: 'CURSOR_GAP' },
        },
      ],
      current.name,
    );
  }
});

void test('[DDA-034] live events reauthorize each emission and terminate immediately after revocation', async () => {
  const bus = new RefreshEventBus();
  const auth = controllableAuthorization();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), auth.port);
  const stream = asObservable(await controller.subscribe({ query: {} }, dashboardId, '0'));
  const messages: MessageEvent[] = [];
  let completed = false;
  const subscription = stream.subscribe({
    next: (message) => messages.push(message),
    complete: () => {
      completed = true;
    },
  });

  assert.equal(listenerCount(bus), 1);
  void bus.publish(refreshEvent(1));
  await waitFor(() => messages.length === 1);
  auth.setAllowed(false);
  void bus.publish(refreshEvent(2));
  await waitFor(() => completed);

  assert.equal(messages.length, 1);
  assert.equal(auth.calls.length, 3);
  assert.equal(listenerCount(bus), 0);
  subscription.unsubscribe();
  assert.equal(listenerCount(bus), 0);
});

void test('[DDA-034] a live sequence gap reconciles and closes before delivering later state', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());
  const stream = asObservable(await controller.subscribe({ query: {} }, dashboardId, '0'));
  const messages: MessageEvent[] = [];
  let completed = false;
  stream.subscribe({
    next: (message) => messages.push(message),
    complete: () => {
      completed = true;
    },
  });

  void bus.publish(refreshEvent(1));
  await waitFor(() => messages.length === 1);
  void bus.publish(refreshEvent(3));
  await waitFor(() => completed);
  void bus.publish(refreshEvent(4));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(messages, [
    {
      id: '1',
      type: 'dashboard-refresh',
      data: {
        sequence: 1,
        dashboardId,
        snapshotId: identifier(0x603),
        freshnessState: 'FRESH',
        eventHash: '1'.repeat(64),
        occurredAt: '2026-08-13T00:00:01.000Z',
      },
    },
    {
      type: 'dashboard-refresh-reconcile',
      data: { reconcileViaRest: true, reasonCode: 'CURSOR_GAP' },
    },
  ]);
});

void test('[DDA-034] disconnect unsubscribes the bus listener and prevents later delivery', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());
  const stream = asObservable(await controller.subscribe({ query: {} }, dashboardId, '0'));
  const messages: MessageEvent[] = [];
  const subscription = stream.subscribe({ next: (message) => messages.push(message) });

  assert.equal(listenerCount(bus), 1);
  subscription.unsubscribe();
  assert.equal(listenerCount(bus), 0);
  void bus.publish(refreshEvent(1));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(messages, []);
});

void test('[DDA-034] malformed producer output is rejected before it can enter the stream', () => {
  const malformed: readonly Partial<ContentSafeRefreshEventV1>[] = [
    { sequence: 0 },
    { sequence: Number.MAX_SAFE_INTEGER + 1 },
    { sequence: 1.5 },
    { dashboardId: 'not-a-stable-id' },
    { snapshotId: 'not-a-stable-id' },
    { freshnessState: 'CURRENT' as never },
    { eventHash: 'A'.repeat(64) },
    { eventHash: 'a'.repeat(63) },
    { eventHash: 'g'.repeat(64) },
    { occurredAt: '2026-08-13T00:00:01+07:00' },
    { occurredAt: '2026-02-30T00:00:01.000Z' },
    { sourceValue: 'must-not-leak' } as never,
  ];

  for (const override of malformed) {
    const bus = new RefreshEventBus();
    assert.throws(() => bus.publish({ ...refreshEvent(1), ...override }), /INVALID_REFRESH_EVENT/u);
    assert.deepEqual(bus.listFor({ tenantScope: scope, dashboardId, cursor: 0 }), {
      events: [],
      highestSequence: 0,
    });
  }
});

void test('[DDA-034] malformed replay output closes without emitting unsafe content', async () => {
  const bus = new MalformedReplayBus({
    ...refreshEvent(1),
    sourceValue: 'must-not-leak',
  });
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());

  const messages = await collect(
    asObservable(await controller.subscribe({ query: {} }, dashboardId, '0')),
  );

  assert.deepEqual(messages, []);
});

void test('[DDA-026][DDA-034] invalid cursors and permission revocation fail closed', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());

  for (const cursor of ['', '01', '-1', '1.5', 'not-a-number', '9007199254740992']) {
    await assert.rejects(
      controller.subscribe({ query: {} }, dashboardId, cursor),
      (error: unknown) => error instanceof BadRequestException,
    );
  }

  await assert.rejects(
    new DashboardRefreshEventsController(bus, requestContext(), authorization(false)).subscribe(
      { query: {} },
      dashboardId,
      '0',
    ),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

void test('[DDA-026][DDA-034] hostile tenant authority fields are rejected before context resolution', async () => {
  const bus = new RefreshEventBus();
  let resolved = false;
  const controller = new DashboardRefreshEventsController(
    bus,
    {
      resolve: () => {
        resolved = true;
        return Promise.resolve(context);
      },
    },
    authorization(),
  );

  await assert.rejects(
    controller.subscribe({ query: { tenantScope: foreignScope } }, dashboardId, '0'),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(resolved, false);
});

void test('[DDA-034] Last-Event-ID resumes after the last emitted event when cursor is omitted', async () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus, requestContext(), authorization());
  void bus.publish(refreshEvent(1));
  void bus.publish(refreshEvent(2));

  const stream = asObservable(
    await controller.subscribe({ headers: { 'last-event-id': '1' }, query: {} }, dashboardId),
  );
  const message = await firstValueFrom(stream.pipe(take(1)));
  assert.equal(message.id, '2');
});
