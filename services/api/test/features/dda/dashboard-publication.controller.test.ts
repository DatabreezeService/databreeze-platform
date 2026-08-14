import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DashboardPublicationControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-publication.controller.js';
import type { DashboardPublicationServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const createdContext = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: {
    scopeType: 'project',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    projectId: '00000000-0000-4000-8000-000000000003',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dashboard-publication-controller',
});
if (!createdContext.accepted) throw new Error('invalid context fixture');
const context = createdContext.value;

const body = Object.freeze({
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  audience: 'WORKSPACE_VIEWERS' as const,
  materializationIds: Object.freeze(['00000000-0000-4000-8000-00000000001f']),
  permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
  expectedRevision: 4,
  idempotencyKey: 'publish-dashboard-controller',
});

function controllerWith(result: unknown) {
  const service = {
    publish(receivedContext: unknown, receivedBody: unknown) {
      assert.equal(receivedContext, context);
      assert.equal(receivedBody, body);
      return Promise.resolve(result);
    },
  } as unknown as DashboardPublicationServiceV1;
  return new DashboardPublicationControllerV1(service, {
    resolve() {
      return Promise.resolve(context);
    },
  });
}

void test('[DDA-025][DDA-026] publication returns a content-safe revisioned success', async () => {
  const response = await controllerWith({
    accepted: true,
    value: {
      snapshotId: '00000000-0000-4000-8000-000000000031',
      dashboardVersionId: body.versionId,
      canonicalHash: 'a'.repeat(64),
    },
  }).publish({}, body);

  assert.deepEqual(response, {
    accepted: true,
    revision: 5,
    snapshotId: '00000000-0000-4000-8000-000000000031',
    dashboardVersionId: body.versionId,
    canonicalHash: 'a'.repeat(64),
  });
});

void test('[DDA-025][DDA-026] publication maps governed rejection codes to HTTP failures', async () => {
  const cases = [
    ['UNAUTHORIZED', ForbiddenException],
    ['VERSION_NOT_FOUND', NotFoundException],
    ['REVISION_CONFLICT', ConflictException],
    ['APPROVAL_INVALIDATED', ConflictException],
    ['INVALID_SNAPSHOT', UnprocessableEntityException],
  ] as const;

  for (const [code, ErrorType] of cases) {
    await assert.rejects(
      () => controllerWith({ accepted: false, code }).publish({}, body),
      (error: unknown) => error instanceof ErrorType,
    );
  }
});

void test('[DDA-026] publication rejects browser authority and anonymous sharing', async () => {
  const controller = controllerWith({ accepted: false, code: 'UNAUTHORIZED' });
  await assert.rejects(
    () => controller.publish({}, { ...body, context } as never),
    (error: unknown) => error instanceof BadRequestException,
  );
  await assert.rejects(
    () => controller.publish({}, { ...body, audience: 'SHARED_LINK' } as never),
    (error: unknown) => error instanceof BadRequestException,
  );
});
