import assert from 'node:assert/strict';
import test from 'node:test';

import { parseV3Contract } from '@databreeze/contracts/v3';
import { HttpException } from '@nestjs/common';

import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';
import { DashboardProposalControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-proposal.controller.js';
import type { DashboardProposalServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-proposal.service.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  tenantScope: {
    scopeType: 'project',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    projectId: '00000000-0000-4000-8000-000000000003',
  },
  actorId: '00000000-0000-4000-8000-000000000004',
  correlationId: '00000000-0000-4000-8000-000000000005',
  idempotencyKey: 'proposal-controller-test',
  authorizationEpoch: 1,
});
if (!contextResult.accepted) throw new Error('invalid controller context');
const context: IamTenantContextV1 = contextResult.value;

function requestContext(): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(context) };
}

const body = {
  question: 'Show revenue by region',
  analysisPlanVersionId: '00000000-0000-4000-8000-000000000008',
  targetPageId: '00000000-0000-4000-8000-000000000009',
  locale: 'en' as const,
};

const proposal = Object.freeze({
  schemaVersion: 3 as const,
  proposalId: '00000000-0000-4000-8000-000000000010',
  dashboardId: '00000000-0000-4000-8000-000000000006',
  parentVersionId: '00000000-0000-4000-8000-000000000007',
  expectedRevision: 3,
  analysisPlanVersionId: body.analysisPlanVersionId,
  target: { pageId: body.targetPageId },
  options: [
    {
      optionId: '00000000-0000-4000-8000-000000000011',
      type: 'BAR',
      title: { vi: 'Doanh thu', en: 'Revenue' },
      rationale: { vi: 'So sánh theo vùng', en: 'Compare by region' },
      accessibilityDescription: {
        vi: 'Biểu đồ doanh thu theo vùng',
        en: 'Revenue by region chart',
      },
      binding: {
        analysisPlanVersionId: body.analysisPlanVersionId,
        materializationDefinitionId: '00000000-0000-4000-8000-000000000012',
        dimensionIds: [],
        measureIds: [],
      },
      dimensions: [],
      measures: [],
      supportedSpans: [6, 12],
      defaultSpan: 6,
      assumptions: [],
      estimate: { cpuMs: 20, memoryMb: 32 },
      evidenceBehavior: 'REQUIRED',
    },
    {
      optionId: '00000000-0000-4000-8000-000000000013',
      type: 'TABLE',
      title: { vi: 'Bảng doanh thu', en: 'Revenue table' },
      rationale: { vi: 'Xem số liệu chi tiết', en: 'Inspect detailed values' },
      accessibilityDescription: { vi: 'Bảng doanh thu theo vùng', en: 'Revenue by region table' },
      binding: {
        analysisPlanVersionId: body.analysisPlanVersionId,
        materializationDefinitionId: '00000000-0000-4000-8000-000000000012',
        dimensionIds: [],
        measureIds: [],
      },
      dimensions: [],
      measures: [],
      supportedSpans: [8, 12],
      defaultSpan: 8,
      assumptions: [],
      estimate: { cpuMs: 20, memoryMb: 32 },
      evidenceBehavior: 'REQUIRED',
    },
  ],
  summary: { vi: 'Hai cách trình bày', en: 'Two presentation options' },
  previewOnly: true as const,
  publishes: false as const,
  createdAt: '2026-08-12T00:00:00.000Z',
});

function assertHttpStatus(error: unknown, status: number): boolean {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);
  return true;
}

void test('[DDA-050] proposal controller rejects browser-supplied authority fields', async () => {
  const calls: unknown[] = [];
  const service = {
    propose: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ accepted: false as const, code: 'UNEXPECTED' as never });
    },
  } as unknown as DashboardProposalServiceV1;
  const controller = new DashboardProposalControllerV1(service, requestContext());
  await assert.rejects(
    controller.createProposal({}, '00000000-0000-4000-8000-000000000006', {
      ...body,
      context: context,
    } as never),
    (error) => assertHttpStatus(error, 400),
  );
  assert.equal(calls.length, 0);
});

void test('[DDA-015, DDA-024, DDA-050] proposal controller returns the raw generated proposal document', async () => {
  const calls: unknown[] = [];
  const service = {
    propose: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ accepted: true as const, value: proposal });
    },
  } as unknown as DashboardProposalServiceV1;
  const controller = new DashboardProposalControllerV1(service, requestContext());
  const result = await controller.createProposal({}, '00000000-0000-4000-8000-000000000006', body);
  assert.deepEqual(result, proposal);
  assert.equal(
    parseV3Contract(
      'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-chart-proposal',
      result,
    ).accepted,
    true,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    context,
    { ...body, dashboardId: '00000000-0000-4000-8000-000000000006' },
  ]);
});

void test('[DDA-050] proposal controller does not enumerate unavailable authentication', async () => {
  const service = {
    propose: () => Promise.resolve({ accepted: true as const, value: {} as never }),
  } as unknown as DashboardProposalServiceV1;
  const controller = new DashboardProposalControllerV1(service, {
    resolve: () => Promise.reject(new Error('auth unavailable')),
  });
  await assert.rejects(
    controller.createProposal({}, '00000000-0000-4000-8000-000000000006', body),
    (error) => assertHttpStatus(error, 503),
  );
});

void test('[DDA-024, DDA-026] proposal controller maps missing and unauthorized subjects identically', async () => {
  for (const code of [
    'UNAUTHORIZED',
    'DASHBOARD_NOT_FOUND',
    'ANALYSIS_PLAN_NOT_FOUND',
    'TARGET_NOT_FOUND',
  ] as const) {
    const service = {
      propose: () => Promise.resolve({ accepted: false as const, code }),
    } as unknown as DashboardProposalServiceV1;
    const controller = new DashboardProposalControllerV1(service, requestContext());
    await assert.rejects(
      controller.createProposal({}, '00000000-0000-4000-8000-000000000006', body),
      (error) => assertHttpStatus(error, 404),
    );
  }
});

void test('[DDA-021, DDA-024] proposal controller maps budget and malformed-provider failures to stable statuses', async () => {
  const cases = [
    ['BUDGET_DENIED', 429],
    ['INVALID_PROPOSAL', 422],
    ['ADAPTER_UNAVAILABLE', 503],
  ] as const;
  for (const [code, status] of cases) {
    const service = {
      propose: () => Promise.resolve({ accepted: false as const, code }),
    } as unknown as DashboardProposalServiceV1;
    const controller = new DashboardProposalControllerV1(service, requestContext());
    await assert.rejects(
      controller.createProposal({}, '00000000-0000-4000-8000-000000000006', body),
      (error) => assertHttpStatus(error, status),
    );
  }
});
