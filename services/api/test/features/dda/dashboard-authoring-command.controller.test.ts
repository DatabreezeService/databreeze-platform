import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { DashboardDraftControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-draft.controller.js';
import { DashboardDraftServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-draft.service.js';
import { DashboardDraftProblemError } from '../../../src/features/dda/dashboard/application/dashboard-draft-problem.error.js';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
if (!scopeResult.accepted) throw new Error('fixture scope invalid');
const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scopeResult.value,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-authoring-controller-test',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;
const dashboardId = '00000000-0000-4000-8000-00000000001b';

void test('[DDA-020] authoring route resolves request tenant and rejects body context', async () => {
  let calls = 0;
  const drafts = {
    applyAuthoringCommand() {
      calls += 1;
      return Promise.resolve({
        accepted: true as const,
        value: {
          commandId: '00000000-0000-4000-8000-0000000000c2',
          dashboardId,
          versionId: '00000000-0000-4000-8000-000000000011',
          revision: 2,
          savedAt: '2026-08-12T02:00:00.000Z',
          publishes: false as const,
        },
      });
    },
  } as unknown as DashboardDraftServiceV1;
  const controller = new DashboardDraftControllerV1(drafts, {
    resolve: () => Promise.resolve(context),
  });
  const result = await controller.authoringCommand({}, dashboardId, {
    schemaVersion: 3,
    commandId: '00000000-0000-4000-8000-0000000000c2',
    createdAt: '2026-08-12T02:00:00.000Z',
    kind: 'REMOVE_WIDGET',
    dashboardId,
    expectedRevision: 1,
    expectedVersionId: '00000000-0000-4000-8000-000000000010',
    widgetId: '00000000-0000-4000-8000-00000000001d',
  });
  assert.equal(result.dashboardId, dashboardId);
  assert.equal(calls, 1);

  await assert.rejects(
    () =>
      controller.authoringCommand({}, dashboardId, {
        schemaVersion: 3,
        commandId: '00000000-0000-4000-8000-0000000000c3',
        createdAt: '2026-08-12T02:00:00.000Z',
        kind: 'REMOVE_WIDGET',
        dashboardId,
        expectedRevision: 1,
        expectedVersionId: '00000000-0000-4000-8000-000000000010',
        widgetId: '00000000-0000-4000-8000-00000000001d',
        context,
      } as never),
    (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400,
  );
  assert.equal(calls, 1);
});

void test('[DDA-020] authoring route does not enumerate an unavailable tenant context', async () => {
  const drafts = {
    applyAuthoringCommand: () =>
      Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const }),
  } as unknown as DashboardDraftServiceV1;
  const controller = new DashboardDraftControllerV1(drafts, {
    resolve: () => Promise.reject(new Error('context unavailable')),
  });
  await assert.rejects(
    () => controller.authoringCommand({}, dashboardId, {} as never),
    (error: unknown) =>
      error instanceof DashboardDraftProblemError && error.code === 'DASHBOARD_DRAFT_UNAVAILABLE',
  );
});

void test('[DDA-026] authoring conflicts are exposed as HTTP 409 while success is raw contract data', async () => {
  const drafts = {
    applyAuthoringCommand: () =>
      Promise.resolve({ accepted: false as const, code: 'REVISION_CONFLICT' as const }),
  } as unknown as DashboardDraftServiceV1;
  const controller = new DashboardDraftControllerV1(drafts, {
    resolve: () => Promise.resolve(context),
  });
  await assert.rejects(
    () =>
      controller.authoringCommand({}, dashboardId, {
        schemaVersion: 3,
        commandId: '00000000-0000-4000-8000-0000000000c4',
        createdAt: '2026-08-12T02:00:00.000Z',
        kind: 'REMOVE_WIDGET',
        dashboardId,
        expectedRevision: 1,
        expectedVersionId: '00000000-0000-4000-8000-000000000010',
        widgetId: '00000000-0000-4000-8000-00000000001d',
      }),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
});
