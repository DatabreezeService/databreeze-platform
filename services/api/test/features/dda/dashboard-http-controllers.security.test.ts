import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BadRequestException,
  ForbiddenException,
  type MessageEvent,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom, isObservable, take, type Observable } from 'rxjs';

import { createApiApplication } from '../../../src/bootstrap.js';
import { DashboardQueryControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-query.controller.js';
import { DashboardQueryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-query.service.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import {
  hasClientAuthorityFields,
  type DashboardResultReaderPortV1,
  type DashboardPermissionProjectionPortV1,
} from '../../../src/features/dda/dashboard/application/dashboard-http-ports.js';
import { DashboardRefreshController } from '../../../src/features/dda/refresh/api/dashboard-refresh.controller.js';
import { DashboardRefreshEventsController } from '../../../src/features/dda/refresh/api/dashboard-refresh-events.controller.js';
import { RefreshEventBus } from '../../../src/features/dda/refresh/application/refresh-event-bus.js';
import { FreshnessService } from '../../../src/features/dda/refresh/application/freshness.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';
import { RequestTenantContextProblemError } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-00000000a001',
  tenantScope: {
    scopeType: 'project',
    organizationId: '00000000-0000-4000-8000-00000000a002',
    workspaceId: '00000000-0000-4000-8000-00000000a003',
    projectId: '00000000-0000-4000-8000-00000000a004',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-00000000a005',
  idempotencyKey: 'dashboard-http-security',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const foreignTenant = {
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-00000000b002',
  workspaceId: '00000000-0000-4000-8000-00000000b003',
  projectId: '00000000-0000-4000-8000-00000000b004',
};

const ids = Object.freeze({
  dashboard: '00000000-0000-4000-8000-00000000c001',
  snapshot: '00000000-0000-4000-8000-00000000c002',
});

function request(
  input: {
    readonly body?: unknown;
    readonly query?: unknown;
    readonly params?: unknown;
  } = {},
): unknown {
  return {
    body: input.body,
    query: input.query,
    params: input.params,
  };
}

function contextResolver(): {
  readonly requestContext: RequestTenantContextPortV1;
  readonly requests: unknown[];
} {
  const requests: unknown[] = [];
  return {
    requests,
    requestContext: {
      resolve(input) {
        requests.push(input);
        return Promise.resolve(context);
      },
    },
  };
}

function authorization(initialAllowed = true): {
  readonly port: DashboardAuthorizationPortV1;
  readonly actions: string[];
  setAllowed(value: boolean): void;
} {
  let allowed = initialAllowed;
  const actions: string[] = [];
  return {
    actions,
    setAllowed(value) {
      allowed = value;
    },
    port: {
      authorizeDashboardAction(input) {
        actions.push(input.action);
        return Promise.resolve(
          Object.freeze({
            allowed,
            grantsDatasetAccess: false,
            grantsOriginalAccess: false,
            grantsEvidenceAccess: false,
            grantsAnalysisAccess: false,
            grantsFolderAccess: false,
            grantsRowFieldExpansion: false,
          }),
        );
      },
      projectVisibleFields() {
        return Promise.resolve(Object.freeze(['region']));
      },
    },
  };
}

void test('[DDA-026] dashboard query reads server-owned rows and rejects browser result rows', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  let readCalls = 0;
  const resultReader: DashboardResultReaderPortV1 = {
    read(input) {
      readCalls += 1;
      assert.equal(input.context, context);
      assert.equal(input.snapshotId, ids.snapshot);
      return Promise.resolve(
        Object.freeze({
          accepted: true as const,
          rows: Object.freeze([
            Object.freeze({ region: 'server', amount: '100', salary_secret: 'hidden' }),
          ]),
        }),
      );
    },
  };
  const controller = new DashboardQueryControllerV1(
    new DashboardQueryServiceV1(auth.port),
    resolved.requestContext,
    resultReader,
  );

  const viewed = await controller.view(request({ body: { snapshotId: ids.snapshot } }), {
    snapshotId: ids.snapshot,
  });
  assert.equal(viewed.accepted, true);
  if (!viewed.accepted) return;
  assert.deepEqual(viewed.value.rows, [{ region: 'server' }]);
  assert.equal(readCalls, 1);
  assert.deepEqual(auth.actions, ['VIEW', 'VIEW']);

  await assert.rejects(
    controller.view(
      request({ body: { snapshotId: ids.snapshot, rows: [{ region: 'browser' }] } }),
      { snapshotId: ids.snapshot, rows: [{ region: 'browser' }] } as never,
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(readCalls, 1);

  for (const action of ['FILTER', 'DRILL', 'SUBSCRIBE'] as const) {
    const authorized = await controller.authorize(
      request({ body: { snapshotId: ids.snapshot, action } }),
      { snapshotId: ids.snapshot, action },
    );
    assert.equal(authorized.accepted, true);
  }
  assert.deepEqual(auth.actions, ['VIEW', 'VIEW', 'FILTER', 'DRILL', 'SUBSCRIBE']);
});

void test('[DDA-026] hostile tenant authority fields are rejected before request context or data resolution', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const resultReader: DashboardResultReaderPortV1 = {
    read() {
      throw new Error('browser must not reach result reader');
    },
  };
  const controller = new DashboardQueryControllerV1(
    new DashboardQueryServiceV1(auth.port),
    resolved.requestContext,
    resultReader,
  );

  await assert.rejects(
    controller.authorize(request({ query: { tenantScope: foreignTenant } }), {
      snapshotId: ids.snapshot,
      action: 'FILTER',
    }),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(resolved.requests.length, 0);
});

void test('[DDA-026] query reauthorization denies a revoked viewer without exposing rows', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const resultReader: DashboardResultReaderPortV1 = {
    read() {
      return Promise.resolve(
        Object.freeze({
          accepted: true as const,
          rows: Object.freeze([Object.freeze({ region: 'server' })]),
        }),
      );
    },
  };
  const controller = new DashboardQueryControllerV1(
    new DashboardQueryServiceV1(auth.port),
    resolved.requestContext,
    resultReader,
  );

  const first = await controller.view(request({ body: { snapshotId: ids.snapshot } }), {
    snapshotId: ids.snapshot,
  });
  assert.equal(first.accepted, true);
  auth.setAllowed(false);
  await assert.rejects(
    controller.view(request({ body: { snapshotId: ids.snapshot } }), { snapshotId: ids.snapshot }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

void test('[DDA-033] freshness derives request authority and server time, never client freshness context', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  let freshnessInput: Record<string, unknown> | undefined;
  const freshness = {
    getFreshness(input: Record<string, unknown>) {
      freshnessInput = input;
      return Promise.resolve(
        Object.freeze({
          accepted: true as const,
          value: Object.freeze({ freshnessState: 'CURRENT' as const }),
        }),
      );
    },
  } as unknown as FreshnessService;
  const projection: DashboardPermissionProjectionPortV1 = {
    resolve(input) {
      assert.equal(input.context, context);
      assert.equal(input.dashboardId, ids.dashboard);
      return Promise.resolve(
        Object.freeze({
          accepted: true as const,
          permissionProjectionVersionId: '00000000-0000-4000-8000-00000000c003',
        }),
      );
    },
  };
  const controller = new DashboardRefreshController(
    freshness,
    resolved.requestContext,
    auth.port,
    projection,
  );
  const before = Date.now();
  const result = await controller.getFreshness(request({ query: {} }), ids.dashboard);
  const after = Date.now();
  assert.deepEqual(result, { accepted: true, value: { freshnessState: 'CURRENT' } });
  assert.equal(freshnessInput?.['tenantScope'], context.tenantScope);
  assert.equal(
    freshnessInput?.['authorizedPermissionProjectionVersionId'],
    '00000000-0000-4000-8000-00000000c003',
  );
  assert.ok((freshnessInput?.['nowMs'] as number) >= before);
  assert.ok((freshnessInput?.['nowMs'] as number) <= after);
  assert.deepEqual(auth.actions, ['VIEW']);
});

void test('[DDA-033] hostile tenant freshness fields are rejected before context resolution', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const controller = new DashboardRefreshController(
    {} as FreshnessService,
    resolved.requestContext,
    auth.port,
    {
      resolve: () =>
        Promise.resolve({ accepted: true as const, permissionProjectionVersionId: 'x' }),
    },
  );

  await assert.rejects(
    controller.getFreshness(
      request({ params: { tenantScope: foreignTenant }, body: { context: context } }),
      ids.dashboard,
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(resolved.requests.length, 0);
});

void test('[DDA-033] freshness reauthorization fails closed after revocation', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const controller = new DashboardRefreshController(
    {
      getFreshness() {
        return Promise.resolve(Object.freeze({ accepted: true as const, value: {} }));
      },
    } as unknown as FreshnessService,
    resolved.requestContext,
    auth.port,
    {
      resolve: () =>
        Promise.resolve(
          Object.freeze({
            accepted: true as const,
            permissionProjectionVersionId: '00000000-0000-4000-8000-00000000c003',
          }),
        ),
    },
  );

  await controller.getFreshness(request(), ids.dashboard);
  auth.setAllowed(false);
  await assert.rejects(
    controller.getFreshness(request(), ids.dashboard),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

void test('[DDA-034] refresh events reauthorize SUBSCRIBE and return only content-safe events', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const bus = new RefreshEventBus();
  void bus.publish({
    sequence: 1,
    tenantScope: context.tenantScope,
    dashboardId: ids.dashboard,
    snapshotId: ids.snapshot,
    freshnessState: 'FRESH',
    eventHash: 'a'.repeat(64),
    occurredAt: '2026-08-13T00:00:00.000Z',
  });
  const controller = new DashboardRefreshEventsController(bus, resolved.requestContext, auth.port);
  const stream = await controller.subscribe(
    request({ query: { cursor: '0' } }),
    ids.dashboard,
    '0',
  );
  assert.equal(isObservable(stream), true);
  const first = await firstValueFrom((stream as unknown as Observable<MessageEvent>).pipe(take(1)));
  assert.deepEqual(first, {
    id: '1',
    type: 'dashboard-refresh',
    data: {
      sequence: 1,
      dashboardId: ids.dashboard,
      snapshotId: ids.snapshot,
      freshnessState: 'FRESH',
      eventHash: 'a'.repeat(64),
      occurredAt: '2026-08-13T00:00:00.000Z',
    },
  });
  assert.equal('tenantScope' in (first.data as Record<string, unknown>), false);
  assert.deepEqual(auth.actions, ['SUBSCRIBE', 'SUBSCRIBE']);
});

void test('[DDA-034] hostile tenant event fields are rejected and revocation returns permission change', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const controller = new DashboardRefreshEventsController(
    new RefreshEventBus(),
    resolved.requestContext,
    auth.port,
  );

  await assert.rejects(
    controller.subscribe(
      request({ query: { tenantScope: foreignTenant, cursor: '0' } }),
      ids.dashboard,
      '0',
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(resolved.requests.length, 0);

  auth.setAllowed(false);
  await assert.rejects(
    controller.subscribe(request({ query: { cursor: '0' } }), ids.dashboard, '0'),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

void test('[DDA-034] real HTTP route returns text/event-stream and a safe reconciliation event', async () => {
  const resolved = contextResolver();
  const auth = authorization();
  const created = await createApiApplication({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    requestTenantContext: resolved.requestContext,
    dashboardAuthorization: auth.port,
  });

  try {
    const bus = created.app.get(RefreshEventBus);
    void bus.publish({
      sequence: 2,
      tenantScope: context.tenantScope,
      dashboardId: ids.dashboard,
      snapshotId: ids.snapshot,
      freshnessState: 'FRESH',
      eventHash: 'a'.repeat(64),
      occurredAt: '2026-08-13T00:00:00.000Z',
    });

    await created.app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(
      `${await created.app.getUrl()}/v1/dda/dashboards/${ids.dashboard}/refresh-events?cursor=0`,
      { headers: { accept: 'text/event-stream' } },
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/u);
    assert.match(body, /event: dashboard-refresh-reconcile/u);
    assert.match(body, /reconcileViaRest/iu);
    assert.doesNotMatch(body, /tenantScope|snapshotId|FRESH/u);
  } finally {
    await created.app.close();
  }
});

void test('[DDA-026][DDA-034] real HTTP initial revocation is a safe 403, never accepted JSON', async () => {
  const resolved = contextResolver();
  const auth = authorization(false);
  const created = await createApiApplication({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    requestTenantContext: resolved.requestContext,
    dashboardAuthorization: auth.port,
  });

  try {
    await created.app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(
      `${await created.app.getUrl()}/v1/dda/dashboards/${ids.dashboard}/refresh-events?cursor=0`,
      { headers: { accept: 'text/event-stream' } },
    );
    const body = await response.text();

    assert.equal(response.status, 403);
    assert.doesNotMatch(body, /accepted/iu);
    assert.doesNotMatch(body, /tenantScope|snapshotId|resultCells/iu);
  } finally {
    await created.app.close();
  }
});

void test('[DDA-026][DDA-033][DDA-034] absent controller authority dependencies fail closed', async () => {
  const resolved = contextResolver();
  const query = new DashboardQueryControllerV1(
    new DashboardQueryServiceV1(authorization().port),
    resolved.requestContext,
  );
  await assert.rejects(
    query.view(request(), { snapshotId: ids.snapshot }),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );

  const freshness = new DashboardRefreshController({} as FreshnessService, resolved.requestContext);
  await assert.rejects(
    freshness.getFreshness(request(), ids.dashboard),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );

  const events = new DashboardRefreshEventsController(
    new RefreshEventBus(),
    resolved.requestContext,
  );
  await assert.rejects(
    events.subscribe(request({ query: { cursor: '0' } }), ids.dashboard, '0'),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
});

void test('[IAM-002][IAM-019] request-context authentication failures map to safe HTTP errors', async () => {
  const auth = authorization();
  const resultReader: DashboardResultReaderPortV1 = {
    read: () =>
      Promise.resolve(
        Object.freeze({
          accepted: true as const,
          rows: Object.freeze([] as Record<string, string>[]),
        }),
      ),
  };
  for (const [code, expected] of [
    ['AUTHENTICATION_FAILED', UnauthorizedException],
    ['AUTHENTICATION_UNAVAILABLE', ServiceUnavailableException],
    ['CONTEXT_INVALID', BadRequestException],
  ] as const) {
    const controller = new DashboardQueryControllerV1(
      new DashboardQueryServiceV1(auth.port),
      {
        resolve: () => Promise.reject(new RequestTenantContextProblemError(code)),
      },
      resultReader,
    );
    await assert.rejects(
      controller.view(request(), { snapshotId: ids.snapshot }),
      (error: unknown) => error instanceof expected,
    );
  }
});

function nestedContent(depth: number, leaf: unknown): unknown {
  let value = leaf;
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

void test('[DDA-026] authority scanning fails closed for deeply nested JSON without recursion errors', () => {
  let result = false;
  assert.doesNotThrow(() => {
    result = hasClientAuthorityFields({ body: nestedContent(2_048, { chart: 'line' }) });
  });
  assert.equal(result, true);
});

void test('[DDA-026] authority scanning fails closed for wide arrays and objects', () => {
  const wideArray = Array.from({ length: 5_000 }, () => ({ value: 'chart' }));
  const wideObject = Object.fromEntries(
    Array.from({ length: 5_000 }, (_, index) => [`field${index}`, 'filter']),
  );

  assert.equal(hasClientAuthorityFields({ body: wideArray }), true);
  assert.equal(hasClientAuthorityFields({ body: wideObject }), true);
});

void test('[DDA-026] authority scanning rejects cyclic authority objects', () => {
  const cyclic: Record<string, unknown> = { chart: { type: 'line' } };
  cyclic['self'] = cyclic;

  assert.equal(hasClientAuthorityFields({ body: cyclic }), true);
});

void test('[DDA-026] authority scanning finds forbidden keys near the bounded depth', () => {
  const nearBoundary = nestedContent(64, { context: { actorId: 'browser' } });

  assert.equal(hasClientAuthorityFields({ body: nearBoundary }), true);
});

void test('[DDA-026] bounded chart and filter content remains accepted', () => {
  assert.equal(
    hasClientAuthorityFields({
      body: {
        chart: {
          type: 'line',
          series: [{ name: 'revenue', values: [10, 20, 30] }],
        },
        filters: [{ field: 'region', values: ['north', 'south'] }],
      },
    }),
    false,
  );
});
