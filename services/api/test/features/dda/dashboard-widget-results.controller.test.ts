/* eslint-disable @typescript-eslint/require-await -- test doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DdaDashboardWidgetResultsAccepted } from '@databreeze/contracts/v4';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { DashboardWidgetResultsControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-widget-results.controller.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import type { DashboardPermissionProjectionPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-http-ports.js';
import type { DashboardWidgetResultReaderPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-widget-result.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000101',
  correlation: '00000000-0000-4000-8000-000000000102',
  dashboard: '00000000-0000-4000-8000-000000000103',
  snapshot: '00000000-0000-4000-8000-000000000104',
  version: '00000000-0000-4000-8000-000000000105',
  datasetVersion: '00000000-0000-4000-8000-000000000106',
  widget: '00000000-0000-4000-8000-000000000107',
  cell: '00000000-0000-4000-8000-000000000108',
  plan: '00000000-0000-4000-8000-000000000109',
  metric: '00000000-0000-4000-8000-000000000110',
  evidence: '00000000-0000-4000-8000-000000000111',
  permission: '00000000-0000-4000-8000-000000000112',
} as const;

const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
});
assert.equal(scopeResult.accepted, true);
if (!scopeResult.accepted) throw new Error('TEST_SCOPE_INVALID');
const contextResult = createIamTenantContextV1({
  actorId: ids.actor,
  tenantScope: scopeResult.value,
  authorizationEpoch: 1,
  correlationId: ids.correlation,
  idempotencyKey: 'dashboard-widget-result-test',
});
assert.equal(contextResult.accepted, true);
if (!contextResult.accepted) throw new Error('TEST_CONTEXT_INVALID');
const context = contextResult.value;

const acceptedResult: DdaDashboardWidgetResultsAccepted = Object.freeze({
  schemaVersion: 4,
  accepted: true,
  dashboardId: ids.dashboard,
  snapshotId: ids.snapshot,
  freshness: Object.freeze({
    state: 'STALE',
    lastSuccessfulRefreshAt: '2026-08-13T10:00:00.000Z',
    inputSelectorHash: 'a'.repeat(64),
    dashboardVersionId: ids.version,
    inputVersionIds: Object.freeze([ids.datasetVersion]),
    reasonCode: 'NEWER_DATASET_ACCEPTED',
  }),
  widgets: Object.freeze([
    Object.freeze({
      widgetId: ids.widget,
      resultState: 'STALE',
      rows: Object.freeze([
        Object.freeze({
          label: 'Revenue',
          displayValue: '1250000 VND',
          numericValue: 1_250_000,
          unit: 'VND',
          provenance: Object.freeze({
            resultCellId: ids.cell,
            planVersionId: ids.plan,
            metricVersionId: ids.metric,
            datasetVersionId: ids.datasetVersion,
            evidenceRefs: Object.freeze([ids.evidence]),
          }),
        }),
      ]),
    }),
  ]),
});

function authorization(allowed = true): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction: async (input) => {
      assert.equal(input.context, context);
      assert.equal(input.dashboardId, ids.dashboard);
      assert.equal(input.action, 'VIEW');
      return Object.freeze({ allowed, grantsDatasetAccess: false });
    },
    projectVisibleFields: async () => Object.freeze([]),
  };
}

function projection(): DashboardPermissionProjectionPortV1 {
  return {
    resolve: async (input) => {
      assert.equal(input.context, context);
      assert.equal(input.snapshotId, ids.snapshot);
      return Object.freeze({
        accepted: true,
        permissionProjectionVersionId: ids.permission,
      });
    },
  };
}

function controller(
  reader: DashboardWidgetResultReaderPortV1,
  auth: DashboardAuthorizationPortV1 = authorization(),
) {
  return new DashboardWidgetResultsControllerV1(
    { resolve: async () => context },
    auth,
    projection(),
    reader,
  );
}

void test('[DDA-018][DDA-026][DDA-033] reads one exact authorized last-good snapshot without client authority', async () => {
  const reader: DashboardWidgetResultReaderPortV1 = {
    read: async (input) => {
      assert.deepEqual(input, {
        context,
        dashboardId: ids.dashboard,
        snapshotId: ids.snapshot,
        permissionProjectionVersionId: ids.permission,
      });
      return Object.freeze({ accepted: true, value: acceptedResult });
    },
  };
  const result = await controller(reader).get(
    { query: {}, params: {} },
    ids.dashboard,
    ids.snapshot,
  );
  assert.deepEqual(result, acceptedResult);
  assert.equal(JSON.stringify(result).includes('tenantScope'), false);
  assert.equal(JSON.stringify(result).includes('permissionProjectionVersionId'), false);
});

void test('[DDA-026] denied and absent snapshots are non-enumerating', async () => {
  for (const code of ['UNAUTHORIZED', 'NOT_FOUND'] as const) {
    const reader: DashboardWidgetResultReaderPortV1 = {
      read: async () => Object.freeze({ accepted: false, code }),
    };
    await assert.rejects(
      controller(reader).get({ query: {}, params: {} }, ids.dashboard, ids.snapshot),
      (error: unknown) => error instanceof ForbiddenException,
    );
  }
  await assert.rejects(
    controller(
      { read: async () => Object.freeze({ accepted: true, value: acceptedResult }) },
      authorization(false),
    ).get({ query: {}, params: {} }, ids.dashboard, ids.snapshot),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

void test('[DDA-026] rejects authority smuggling and maps unavailable storage safely', async () => {
  const unavailable: DashboardWidgetResultReaderPortV1 = {
    read: async () => Object.freeze({ accepted: false, code: 'UNAVAILABLE' }),
  };
  await assert.rejects(
    controller(unavailable).get(
      { query: { tenantScope: { workspaceId: 'hostile' } } },
      ids.dashboard,
      ids.snapshot,
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  await assert.rejects(
    controller(unavailable).get({ query: {}, params: {} }, ids.dashboard, ids.snapshot),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
});
