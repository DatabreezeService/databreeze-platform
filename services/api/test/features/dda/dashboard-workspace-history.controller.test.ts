import assert from 'node:assert/strict';
import test from 'node:test';

import { parseV3Contract } from '@databreeze/contracts/v3';
import { HttpException } from '@nestjs/common';

import { InMemoryDashboardWorkspaceHistoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-workspace-history.adapter.js';
import { DashboardWorkspaceHistoryControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-workspace-history.controller.js';
import { DashboardWorkspaceHistoryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-workspace-history.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000711',
  workspace: '00000000-0000-4000-8000-000000000712',
  project: '00000000-0000-4000-8000-000000000713',
  actor: '00000000-0000-4000-8000-000000000714',
  correlation: '00000000-0000-4000-8000-000000000715',
  dashboard: '00000000-0000-4000-8000-000000000716',
});

function context() {
  const created = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'project',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
      projectId: ids.project,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: 'dashboard-history-controller',
    authorizationEpoch: 1,
  });
  if (!created.accepted) throw new Error(created.code);
  assert.equal(created.accepted, true, 'controller fixture context must be valid');
  return created.value;
}

function controller(requestContext: RequestTenantContextPortV1) {
  const repository = new InMemoryDashboardWorkspaceHistoryAdapter();
  repository.seed([
    {
      tenantScope: context().tenantScope,
      candidate: {
        kind: 'DASHBOARD',
        subjectId: ids.dashboard,
        title: { vi: 'B\u1ea3ng \u0111i\u1ec1u khi\u1ec3n', en: 'Dashboard' },
        updatedAt: '2026-08-12T10:00:00.000Z',
        safeStatus: 'CURRENT',
      },
    },
  ]);
  return new DashboardWorkspaceHistoryControllerV1(
    new DashboardWorkspaceHistoryServiceV1(repository),
    requestContext,
  );
}

function assertHttpStatus(error: unknown, status: number): boolean {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);
  return true;
}

void test('[DDA-026, DDA-031, DDA-033, DDA-036] GET workspace history uses only the authenticated current tenant context', async () => {
  const current = context();
  const requestContext: RequestTenantContextPortV1 = {
    resolve() {
      return Promise.resolve(current);
    },
  };
  const subject = controller(requestContext);

  const result = await subject.list({}, { limit: 30 });

  assert.equal(result.schemaVersion, 3);
  assert.deepEqual(
    result.items.map((item) => item.subjectId),
    [ids.dashboard],
  );
  assert.equal(
    parseV3Contract(
      'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-workspace-history',
      result,
    ).accepted,
    true,
  );
  assert.equal(JSON.stringify(result).includes('context'), false);
});

void test('[DDA-026] workspace history rejects a client-supplied context and fails closed when request context is unavailable', async () => {
  const current = context();
  const requestContext: RequestTenantContextPortV1 = {
    resolve() {
      return Promise.resolve(current);
    },
  };
  const subject = controller(requestContext);

  await assert.rejects(
    subject.list({ body: { context: { tenantScope: 'client-controlled' } } }, {
      limit: 30,
    } as never),
    (error) => assertHttpStatus(error, 400),
  );

  const unavailable = controller({
    resolve() {
      return Promise.reject(new Error('session lookup unavailable'));
    },
  });
  await assert.rejects(unavailable.list({}, { limit: 30 }), (error) =>
    assertHttpStatus(error, 503),
  );
});

void test('[DDA-026, DDA-043] workspace history rejects malformed and oversized cursors with HTTP 400', async () => {
  const subject = controller({ resolve: () => Promise.resolve(context()) });
  await assert.rejects(subject.list({}, { cursor: 'x'.repeat(513), limit: 30 }), (error) =>
    assertHttpStatus(error, 400),
  );
});
