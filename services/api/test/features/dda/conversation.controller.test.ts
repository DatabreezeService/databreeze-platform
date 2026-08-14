/* eslint-disable @typescript-eslint/require-await -- controller fakes mirror async services. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { InMemoryConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/in-memory-conversation-repository.adapter.js';
import {
  ConversationController,
  conversationProblemStatus,
  type ConversationCreateDtoV1,
} from '../../../src/features/dda/conversation/api/conversation.controller.js';
import type { AgentAuthorityPortV1 } from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import type {
  ConversationMessageRecordV1,
  ConversationRecordV1,
} from '../../../src/features/dda/conversation/application/conversation-repository.port.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../src/platform/http/request-tenant-context.port.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  otherOrganization: '00000000-0000-4000-8000-000000000101',
  otherWorkspace: '00000000-0000-4000-8000-000000000102',
  actor: '00000000-0000-4000-8000-000000000003',
  correlation: '00000000-0000-4000-8000-000000000004',
  conversation: '00000000-0000-4000-8000-000000000005',
  dataset: '00000000-0000-4000-8000-000000000006',
  secondDataset: '00000000-0000-4000-8000-000000000009',
  datasetVersion: '00000000-0000-4000-8000-000000000007',
  secondDatasetVersion: '00000000-0000-4000-8000-00000000000a',
  dashboard: '00000000-0000-4000-8000-00000000000b',
  message: '00000000-0000-4000-8000-000000000008',
});

function context(
  organizationId: string = ids.organization,
  workspaceId: string = ids.workspace,
): IamTenantContextV1 {
  return {
    tenantScope: {
      scopeType: 'workspace',
      organizationId,
      workspaceId,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: 'conversation-controller',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  } as IamTenantContextV1;
}

const createDto: ConversationCreateDtoV1 = {
  title: 'Sales questions',
  datasetIds: [ids.dataset],
  datasetVersionIds: { [ids.dataset]: ids.datasetVersion },
  dashboardId: ids.dashboard,
  filterContext: 'month = 8',
  idempotencyKey: 'create-1',
};

const conversation = {
  conversationId: ids.conversation,
  tenantScope: context().tenantScope,
  title: createDto.title,
  activeDatasetIds: createDto.datasetIds,
  activeDatasetVersionIds: createDto.datasetVersionIds,
  dashboardId: createDto.dashboardId,
  filterContext: createDto.filterContext,
  retentionHold: false,
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
} as ConversationRecordV1;

const message = {
  messageId: ids.message,
  conversationId: ids.conversation,
  tenantScope: context().tenantScope,
  role: 'USER',
  text: 'Hello',
  sequence: 1,
  idempotencyKey: 'message-1',
  createdAt: '2026-08-13T00:00:00.000Z',
} as ConversationMessageRecordV1;

function createController(
  currentContext: IamTenantContextV1 = context(),
  requestContext: RequestTenantContextPortV1 = {
    resolve: async () => currentContext,
  },
  responses: {
    readonly create?: unknown;
    readonly list?: unknown;
    readonly load?: unknown;
  } = {},
  authority?: AgentAuthorityPortV1,
  versionAuthority?: {
    readonly authorizeDatasetVersion: (input: unknown) => Promise<unknown>;
  },
  dashboardAuthorization?: DashboardAuthorizationPortV1,
) {
  const authorityCalls: unknown[] = [];
  const versionAuthorityCalls: unknown[] = [];
  const effectiveAuthority: AgentAuthorityPortV1 = authority ?? {
    authorize: async (input) => {
      authorityCalls.push(input);
      return Object.freeze({
        allowed: true as const,
        effectiveAgentLevel: 'ANALYZE' as const,
        accessPreset: 'EDITOR' as const,
        deniedDatasetIds: Object.freeze([] as string[]),
      });
    },
  };
  const effectiveVersionAuthority = versionAuthority ?? {
    authorizeDatasetVersion: async (input: unknown) => {
      versionAuthorityCalls.push(input);
      return Object.freeze({ allowed: true as const });
    },
  };
  const effectiveDashboardAuthorization: DashboardAuthorizationPortV1 = dashboardAuthorization ?? {
    authorizeDashboardAction: async () =>
      Object.freeze({ allowed: true, grantsDatasetAccess: false }),
    projectVisibleFields: async () => [],
  };
  const calls: { create: unknown[]; list: unknown[]; load: unknown[] } = {
    create: [],
    list: [],
    load: [],
  };
  const service = {
    async createConversation(...input: unknown[]) {
      calls.create.push(input);
      return responses.create ?? { accepted: true as const, value: conversation };
    },
    async listConversations(...input: unknown[]) {
      calls.list.push(input);
      return responses.list ?? { accepted: true as const, value: [conversation] };
    },
    async loadConversation(...input: unknown[]) {
      calls.load.push(input);
      return (
        responses.load ?? {
          accepted: true as const,
          value: { conversation, messages: [message] },
        }
      );
    },
  } as unknown as ConversationService;
  const Controller = ConversationController as unknown as new (
    ...args: unknown[]
  ) => ConversationController;
  return {
    controller: new Controller(
      service,
      requestContext,
      effectiveAuthority,
      effectiveVersionAuthority,
      effectiveDashboardAuthorization,
    ),
    calls,
    authority: effectiveAuthority,
    authorityCalls,
    versionAuthority: effectiveVersionAuthority,
    versionAuthorityCalls,
  };
}

function assertHttpStatus(error: unknown, status: number): boolean {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);
  return true;
}

void test('[IAM-002][IAM-009][IAM-019][DDA-026][DDA-055][DDA-056] conversation routes use the authenticated tenant context and preserve content and paging inputs', async () => {
  const trusted = context();
  const requests: unknown[] = [];
  const requestContext: RequestTenantContextPortV1 = {
    async resolve(request) {
      requests.push(request);
      return trusted;
    },
  };
  const { controller, calls, authorityCalls } = createController(trusted, requestContext);
  const request = { headers: { authorization: 'Bearer trusted' } };

  const created = await controller.create(request, createDto);
  const listed = await controller.list(request, { cursor: ids.conversation, limit: '7' });
  const loaded = await controller.load(request, ids.conversation, {
    beforeCursor: ids.message,
    limit: '9',
  });

  assert.equal(created.accepted, true);
  assert.equal(listed.accepted, true);
  assert.equal(loaded.accepted, true);
  assert.deepEqual(requests, [request, request, request]);
  assert.deepEqual(authorityCalls, [
    { context: trusted, datasetIds: createDto.datasetIds },
    { context: trusted, datasetIds: conversation.activeDatasetIds },
    { context: trusted, datasetIds: conversation.activeDatasetIds },
  ]);
  assert.deepEqual(calls.create, [
    [
      { tenantScope: trusted.tenantScope, memberAuthorized: true },
      {
        title: createDto.title,
        datasetIds: createDto.datasetIds,
        datasetVersionIds: createDto.datasetVersionIds,
        dashboardId: createDto.dashboardId,
        filterContext: createDto.filterContext,
      },
      createDto.idempotencyKey,
    ],
  ]);
  assert.deepEqual(calls.list, [
    [{ tenantScope: trusted.tenantScope, memberAuthorized: true }, ids.conversation, 7],
  ]);
  assert.deepEqual(calls.load, [
    [
      { tenantScope: trusted.tenantScope, memberAuthorized: true },
      ids.conversation,
      ids.message,
      9,
    ],
  ]);
});

void test('[IAM-024][DDA-055] create rejects a Viewer with effective NONE and never calls ConversationService', async () => {
  const authorityCalls: unknown[] = [];
  const viewerAuthority: AgentAuthorityPortV1 = {
    authorize: async (input) => {
      authorityCalls.push(input);
      return Object.freeze({
        allowed: true as const,
        effectiveAgentLevel: 'NONE' as const,
        accessPreset: 'VIEWER' as const,
        deniedDatasetIds: Object.freeze([] as string[]),
      });
    },
  };
  const { controller, calls } = createController(context(), undefined, {}, viewerAuthority);

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 403));
  assert.equal(calls.create.length, 0);
  assert.deepEqual(authorityCalls, [{ context: context(), datasetIds: createDto.datasetIds }]);
});

void test('[IAM-024][DDA-055] denied dataset restrictions return safe 403 before ConversationService', async () => {
  const authorityCalls: unknown[] = [];
  const restrictedAuthority: AgentAuthorityPortV1 = {
    authorize: async (input) => {
      authorityCalls.push(input);
      return Object.freeze({ allowed: false as const, code: 'DATASET_RESTRICTED' as const });
    },
  };
  const { controller, calls } = createController(context(), undefined, {}, restrictedAuthority);

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 403));
  assert.equal(calls.create.length, 0);
  assert.deepEqual(authorityCalls, [{ context: context(), datasetIds: createDto.datasetIds }]);
});

void test('[IAM-024] authority outage returns safe 503 before ConversationService', async () => {
  const unavailableAuthority: AgentAuthorityPortV1 = {
    authorize: async () => {
      throw new Error('IAM unavailable');
    },
  };
  const { controller, calls } = createController(context(), undefined, {}, unavailableAuthority);

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 503));
  assert.equal(calls.create.length, 0);
});

void test('[IAM-024] missing authority dependency fails closed', async () => {
  const calls: unknown[] = [];
  const service = {
    async createConversation(...input: unknown[]) {
      calls.push(input);
      return { accepted: true as const, value: conversation };
    },
  } as unknown as ConversationService;
  const controller = new ConversationController(service, {
    resolve: async () => context(),
  });

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 403));
  assert.equal(calls.length, 0);
});

void test('[IAM-002][IAM-009][IAM-019] conversation routes reject authority fields from body, query, and params before resolving context', async () => {
  const resolve = async () => {
    throw new Error('authority-bearing request must not resolve');
  };
  const { controller, calls } = createController(context(), { resolve });

  await assert.rejects(
    controller.create({ body: {}, query: {}, params: {} }, {
      ...createDto,
      tenantScope: context().tenantScope,
      memberAuthorized: true,
    } as ConversationCreateDtoV1),
    (error) => assertHttpStatus(error, 400),
  );
  await assert.rejects(
    controller.list(
      { body: {}, query: { organizationId: ids.organization } },
      { cursor: ids.conversation, limit: '7' },
    ),
    (error) => assertHttpStatus(error, 400),
  );
  await assert.rejects(
    controller.load(
      { body: {}, query: {}, params: { projectId: 'forged-project' } },
      ids.conversation,
      { beforeCursor: ids.message, limit: '9' },
    ),
    (error) => assertHttpStatus(error, 400),
  );

  assert.deepEqual(calls, { create: [], list: [], load: [] });
});

void test('[IAM-002][IAM-009][IAM-019] nested and direct member authority fields are rejected in every transport container', async () => {
  const { controller } = createController();

  await assert.rejects(
    controller.create({ body: {}, query: {}, params: {} }, {
      ...createDto,
      datasetVersionIds: { [ids.dataset]: ids.datasetVersion, memberAuthorized: 'false' },
    } as ConversationCreateDtoV1),
    (error) => assertHttpStatus(error, 400),
  );
  await assert.rejects(
    controller.list(
      { body: { tenantScope: context().tenantScope }, query: {}, params: {} },
      { cursor: ids.conversation, limit: '7' },
    ),
    (error) => assertHttpStatus(error, 400),
  );
  await assert.rejects(
    controller.load({ body: {}, query: {}, params: {} }, ids.conversation, {
      beforeCursor: ids.message,
      limit: '9',
      memberAuthorized: 'true',
    } as never),
    (error) => assertHttpStatus(error, 400),
  );
});

void test('[IAM-002][IAM-009][DDA-055][DDA-056] exact dataset-version mapping is preserved and nested authority values are rejected', async () => {
  const { controller, calls, versionAuthorityCalls } = createController();

  await controller.create(
    {},
    {
      ...createDto,
      title: '  Doanh thu / Revenue  ',
      datasetIds: [ids.dataset, ids.secondDataset],
      datasetVersionIds: {
        [ids.dataset]: ids.datasetVersion,
        [ids.secondDataset]: ids.secondDatasetVersion,
      },
      filterContext: 'Tháng 8 / August',
    },
  );
  assert.equal(calls.create.length, 1);
  const createCall = calls.create[0] as unknown[];
  assert.deepEqual(createCall[1], {
    title: 'Doanh thu / Revenue',
    datasetIds: [ids.dataset, ids.secondDataset],
    datasetVersionIds: {
      [ids.dataset]: ids.datasetVersion,
      [ids.secondDataset]: ids.secondDatasetVersion,
    },
    dashboardId: ids.dashboard,
    filterContext: 'Tháng 8 / August',
  });
  assert.deepEqual(versionAuthorityCalls, [
    {
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.datasetVersion,
    },
    {
      context: context(),
      datasetId: ids.secondDataset,
      datasetVersionId: ids.secondDatasetVersion,
    },
  ]);

  await assert.rejects(
    controller.create(
      {},
      {
        ...createDto,
        datasetVersionIds: {
          [ids.dataset]: {
            versionId: ids.datasetVersion,
            memberAuthorized: true,
          } as unknown as string,
        },
      },
    ),
    (error) => assertHttpStatus(error, 400),
  );
  assert.equal(calls.create.length, 1);
});

void test('[DDA-055] create rejects malformed body shapes and bounded-field violations before service access', async () => {
  const tooManyDatasetIds = Array.from(
    { length: 9 },
    (_, index) => `00000000-0000-4000-8000-0000000001${index.toString(16).padStart(2, '0')}`,
  );
  const deeplyNestedAuthorityValue: unknown = (() => {
    let value: unknown = { memberAuthorized: true };
    for (let depth = 0; depth < 12; depth += 1) value = { nested: value };
    return value;
  })();
  const invalidBodies: readonly unknown[] = [
    null,
    [],
    42,
    { ...createDto, title: null },
    { ...createDto, title: '' },
    { ...createDto, title: '   ' },
    { ...createDto, title: 'x'.repeat(201) },
    { ...createDto, title: 42 },
    { ...createDto, datasetIds: null },
    { ...createDto, datasetIds: {} },
    { ...createDto, datasetIds: ids.dataset },
    { ...createDto, datasetIds: [] },
    { ...createDto, datasetIds: [ids.dataset, ids.dataset] },
    { ...createDto, datasetIds: ['not-a-stable-id'] },
    { ...createDto, datasetIds: tooManyDatasetIds },
    { ...createDto, datasetVersionIds: null },
    { ...createDto, datasetVersionIds: [] },
    { ...createDto, datasetVersionIds: 'versions' },
    { ...createDto, datasetVersionIds: {} },
    {
      ...createDto,
      datasetVersionIds: {
        [ids.dataset]: ids.datasetVersion,
        [ids.secondDataset]: ids.secondDatasetVersion,
      },
    },
    { ...createDto, datasetVersionIds: { [ids.dataset]: 'not-a-stable-id' } },
    { ...createDto, datasetVersionIds: { [ids.dataset]: null } },
    { ...createDto, datasetVersionIds: { [ids.dataset]: deeplyNestedAuthorityValue } },
    { ...createDto, dashboardId: null },
    { ...createDto, dashboardId: 42 },
    { ...createDto, dashboardId: 'not-a-stable-id' },
    { ...createDto, filterContext: null },
    { ...createDto, filterContext: 42 },
    { ...createDto, filterContext: [] },
    { ...createDto, filterContext: 'x'.repeat(4_001) },
    { ...createDto, idempotencyKey: null },
    { ...createDto, idempotencyKey: '' },
    { ...createDto, idempotencyKey: '   ' },
    { ...createDto, idempotencyKey: 'x'.repeat(257) },
    { ...createDto, idempotencyKey: 42 },
  ];
  const { controller, calls } = createController();

  for (const body of invalidBodies) {
    await assert.rejects(controller.create({}, body as never), (error) =>
      assertHttpStatus(error, 400),
    );
  }
  assert.equal(calls.create.length, 0);
});

void test('[DDA-055] list and load validate stable cursor identifiers and preserve absent cursors', async () => {
  const { controller, calls } = createController();
  const invalidCursors: readonly unknown[] = [
    null,
    42,
    true,
    [],
    {},
    '',
    'not-a-stable-id',
    'x'.repeat(513),
  ];

  for (const cursor of invalidCursors) {
    await assert.rejects(controller.list({}, { cursor } as never), (error) =>
      assertHttpStatus(error, 400),
    );
    await assert.rejects(
      controller.load({}, ids.conversation, { beforeCursor: cursor } as never),
      (error) => assertHttpStatus(error, 400),
    );
  }
  await assert.rejects(
    controller.load({}, 'not-a-stable-conversation-id', { limit: '1' }),
    (error) => assertHttpStatus(error, 400),
  );

  await controller.list({}, { limit: 1 });
  await controller.load({}, ids.conversation, { limit: 50 });
  assert.deepEqual(calls.list, [
    [{ tenantScope: context().tenantScope, memberAuthorized: true }, undefined, 1],
  ]);
  assert.deepEqual(calls.load, [
    [
      { tenantScope: context().tenantScope, memberAuthorized: true },
      ids.conversation,
      undefined,
      50,
    ],
  ]);
});

void test('[DDA-055] list and load reject malformed, non-finite, fractional, non-positive, and over-limit paging values', async () => {
  const invalidValues: readonly unknown[] = [
    'not-a-number',
    'NaN',
    'Infinity',
    '1.5',
    '0',
    '-1',
    '51',
    NaN,
    Infinity,
    1.5,
    0,
    -1,
    51,
    [],
    [1],
    {},
  ];
  const { controller, calls } = createController();

  await assert.rejects(controller.list({}, null as never), (error) => assertHttpStatus(error, 400));
  await assert.rejects(controller.load({}, ids.conversation, null as never), (error) =>
    assertHttpStatus(error, 400),
  );

  for (const limit of invalidValues) {
    await assert.rejects(controller.list({}, { limit } as never), (error) =>
      assertHttpStatus(error, 400),
    );
    await assert.rejects(controller.load({}, ids.conversation, { limit } as never), (error) =>
      assertHttpStatus(error, 400),
    );
  }
  assert.deepEqual(calls, { create: [], list: [], load: [] });
});

void test('[IAM-002][IAM-009] authentication failures return 401 and unavailable request context returns 503', async () => {
  const authenticationFailure = createController(context(), {
    resolve: async () => {
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    },
  }).controller;
  await assert.rejects(authenticationFailure.list({}, { limit: '20' }), (error) =>
    assertHttpStatus(error, new UnauthorizedException().getStatus()),
  );

  const unavailable = createController(context(), {
    resolve: async () => {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    },
  }).controller;
  await assert.rejects(unavailable.list({}, { limit: '20' }), (error) =>
    assertHttpStatus(error, new ServiceUnavailableException().getStatus()),
  );
});

void test('[DDA-055] service rejections map to safe HTTP responses instead of uncaught 500 errors', async () => {
  const cases: readonly {
    readonly response: unknown;
    readonly status: number;
    readonly invoke: (controller: ConversationController) => Promise<unknown>;
  }[] = [
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_UNAUTHORIZED' as const },
      status: 403,
      invoke: (subject) => subject.create({}, createDto),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_NOT_FOUND' as const },
      status: 404,
      invoke: (subject) => subject.load({}, ids.conversation, { limit: '20' }),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_INVALID_ATTACHMENT' as const },
      status: 422,
      invoke: (subject) => subject.create({}, createDto),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_RETENTION_HOLD' as const },
      status: 409,
      invoke: (subject) => subject.load({}, ids.conversation, { limit: '20' }),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_SUMMARY_TOO_LONG' as const },
      status: 400,
      invoke: (subject) => subject.create({}, createDto),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_SUMMARY_CONFLICT' as const },
      status: 409,
      invoke: (subject) => subject.list({}, { limit: '20' }),
    },
    {
      response: { accepted: false as const, code: 'DDA_CONVERSATION_UNKNOWN' },
      status: 503,
      invoke: (subject) => subject.list({}, { limit: '20' }),
    },
  ];

  for (const item of cases) {
    assert.equal(
      conversationProblemStatus(
        (item.response as { readonly code: Parameters<typeof conversationProblemStatus>[0] }).code,
      ),
      item.status,
    );
    const subject = createController(
      context(),
      { resolve: async () => context() },
      {
        create: item.response,
        list: item.response,
        load: item.response,
      },
    ).controller;
    await assert.rejects(item.invoke(subject), (error) => {
      assertHttpStatus(error, item.status);
      assert.ok(error instanceof HttpException);
      assert.deepEqual(error.getResponse(), { error: 'CONVERSATION_REJECTED' });
      return true;
    });
  }
});

void test('[IAM-024][DDA-055] list reauthorizes each conversation after a grant revocation and omits denied rows', async () => {
  let revoked = false;
  const authorityCalls: unknown[] = [];
  const authority: AgentAuthorityPortV1 = {
    authorize: async (input) => {
      authorityCalls.push(input);
      return revoked
        ? Object.freeze({
            allowed: true as const,
            effectiveAgentLevel: 'NONE' as const,
            accessPreset: 'VIEWER' as const,
            deniedDatasetIds: Object.freeze([] as string[]),
          })
        : Object.freeze({
            allowed: true as const,
            effectiveAgentLevel: 'ANALYZE' as const,
            accessPreset: 'EDITOR' as const,
            deniedDatasetIds: Object.freeze([] as string[]),
          });
    },
  };
  const { controller, calls } = createController(context(), undefined, {}, authority);

  await controller.create({}, createDto);
  revoked = true;
  const listed = await controller.list({}, { limit: '20' });

  assert.deepEqual(listed.items, []);
  assert.equal(calls.list.length, 1);
  assert.deepEqual(authorityCalls[1], {
    context: context(),
    datasetIds: conversation.activeDatasetIds,
  });
});

void test('[IAM-024][DDA-055] load maps current dataset restriction to indistinguishable 404 without exposing row content', async () => {
  const authority: AgentAuthorityPortV1 = {
    authorize: async () =>
      Object.freeze({ allowed: false as const, code: 'DATASET_RESTRICTED' as const }),
  };
  const { controller } = createController(context(), undefined, {}, authority);

  await assert.rejects(controller.load({}, ids.conversation, { limit: '20' }), (error) => {
    assertHttpStatus(error, 404);
    assert.ok(error instanceof HttpException);
    assert.deepEqual(error.getResponse(), { error: 'CONVERSATION_REJECTED' });
    assert.doesNotMatch(JSON.stringify(error), /Sales questions|Hello|month = 8/u);
    return true;
  });
});

void test('[IAM-024][DDA-055] list authority outage fails the whole request with safe 503', async () => {
  const authority: AgentAuthorityPortV1 = {
    authorize: async () => {
      throw new Error('IAM outage');
    },
  };
  const { controller } = createController(context(), undefined, {}, authority);

  await assert.rejects(controller.list({}, { limit: '20' }), (error) =>
    assertHttpStatus(error, 503),
  );
});

void test('[DDA-055][DDA-056] list reauthorizes every dataset-version pair and dashboard VIEW, omitting denied rows', async () => {
  const versionCalls: unknown[] = [];
  const versionAuthority = {
    authorizeDatasetVersion: async (input: unknown) => {
      versionCalls.push(input);
      return Object.freeze({ allowed: true as const });
    },
  };
  const dashboardCalls: unknown[] = [];
  const dashboardAuthorization: DashboardAuthorizationPortV1 = {
    authorizeDashboardAction: async (input) => {
      dashboardCalls.push(input);
      return Object.freeze({
        allowed: input.dashboardId !== ids.dashboard,
        grantsDatasetAccess: false,
      });
    },
    projectVisibleFields: async () => [],
  };
  const { controller } = createController(
    context(),
    undefined,
    {},
    undefined,
    versionAuthority,
    dashboardAuthorization,
  );

  const listed = await controller.list({}, { limit: '20' });
  assert.deepEqual(listed, { schemaVersion: 4, accepted: true, items: [] });
  assert.deepEqual(versionCalls, [
    {
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.datasetVersion,
    },
  ]);
  assert.deepEqual(dashboardCalls, [
    {
      context: context(),
      tenantScope: context().tenantScope,
      actorId: ids.actor,
      dashboardId: ids.dashboard,
      action: 'VIEW',
    },
  ]);
});

void test('[DDA-055] denied dataset-version or dashboard access makes load indistinguishable from not found', async () => {
  const versionAuthority = {
    authorizeDatasetVersion: async () =>
      Object.freeze({ allowed: false as const, code: 'FORBIDDEN' as const }),
  };
  const { controller } = createController(context(), undefined, {}, undefined, versionAuthority);
  await assert.rejects(controller.load({}, ids.conversation, { limit: '20' }), (error) =>
    assertHttpStatus(error, 404),
  );

  const unavailableDashboard: DashboardAuthorizationPortV1 = {
    authorizeDashboardAction: async () => {
      throw new Error('dashboard unavailable');
    },
    projectVisibleFields: async () => [],
  };
  const { controller: outageController } = createController(
    context(),
    undefined,
    {},
    undefined,
    undefined,
    unavailableDashboard,
  );
  await assert.rejects(outageController.load({}, ids.conversation, { limit: '20' }), (error) =>
    assertHttpStatus(error, 503),
  );
});

void test('[DDA-055] dataset-version authority denial rejects mismatch or cross-tenant input before ConversationService', async () => {
  const versionAuthorityCalls: unknown[] = [];
  const versionAuthority = {
    authorizeDatasetVersion: async (input: unknown) => {
      versionAuthorityCalls.push(input);
      return Object.freeze({ allowed: false as const, code: 'NOT_FOUND' as const });
    },
  };
  const { controller, calls } = createController(
    context(),
    undefined,
    {},
    undefined,
    versionAuthority,
  );

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 403));
  assert.equal(calls.create.length, 0);
  assert.deepEqual(versionAuthorityCalls, [
    {
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.datasetVersion,
    },
  ]);
});

void test('[DDA-055] unknown or stale service cursors map to stable 400 and backend failures map to safe 503', async () => {
  const invalidCursor = createController(context(), undefined, {
    list: Promise.reject(new Error('DDA_CONVERSATION_CURSOR_INVALID')),
  }).controller;
  await assert.rejects(invalidCursor.list({}, { cursor: ids.conversation, limit: '20' }), (error) =>
    assertHttpStatus(error, 400),
  );

  const backendFailure = createController(context(), undefined, {
    load: Promise.reject(new Error('database unavailable')),
  }).controller;
  await assert.rejects(backendFailure.load({}, ids.conversation, { limit: '20' }), (error) =>
    assertHttpStatus(error, 503),
  );
});

void test('[IAM-024] malformed agent authority decisions fail closed with safe 503', async () => {
  const malformedAuthority: AgentAuthorityPortV1 = {
    authorize: async () =>
      ({
        allowed: 'true',
        effectiveAgentLevel: 'ANALYZE',
        accessPreset: 'EDITOR',
        deniedDatasetIds: [],
      }) as never,
  };
  const { controller, calls } = createController(context(), undefined, {}, malformedAuthority);

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 503));
  assert.equal(calls.create.length, 0);
});

void test('[DDA-055] list and load return explicit public DTOs without internal persistence fields', async () => {
  const internalConversation = {
    ...conversation,
    revision: 7,
    requestFingerprint: 'secret-conversation-fingerprint',
  };
  const { controller } = createController(context(), undefined, {
    list: { accepted: true as const, value: [internalConversation] },
    load: {
      accepted: true as const,
      value: { conversation: internalConversation, messages: [message] },
    },
  });

  const listed = await controller.list({}, { limit: '20' });
  const loaded = await controller.load({}, ids.conversation, { limit: '20' });

  assert.deepEqual(listed, {
    schemaVersion: 4,
    accepted: true,
    items: [
      {
        schemaVersion: 4,
        conversationId: ids.conversation,
        title: 'Sales questions',
        datasets: [{ datasetId: ids.dataset, datasetVersionId: ids.datasetVersion }],
        dashboardId: ids.dashboard,
        filterContext: 'month = 8',
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
      },
    ],
  });
  assert.deepEqual(loaded, {
    schemaVersion: 4,
    accepted: true,
    conversation: {
      schemaVersion: 4,
      conversationId: ids.conversation,
      title: 'Sales questions',
      datasets: [{ datasetId: ids.dataset, datasetVersionId: ids.datasetVersion }],
      dashboardId: ids.dashboard,
      filterContext: 'month = 8',
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
    messages: [
      {
        messageId: ids.message,
        conversationId: ids.conversation,
        role: 'USER',
        text: 'Hello',
        sequence: 1,
        createdAt: '2026-08-13T00:00:00.000Z',
      },
    ],
    contextEvents: [],
  });
});

void test('[DDA-055][DDA-056] load returns safe message provenance and context events', async () => {
  const contextEvent = {
    eventId: ids.message,
    conversationId: ids.conversation,
    tenantScope: context().tenantScope,
    kind: 'DATASET_VERSION_ADVANCED',
    datasetId: ids.dataset,
    beforeVersionId: ids.datasetVersion,
    afterVersionId: ids.datasetVersion,
    sequence: 2,
    occurredAt: '2026-08-13T00:00:02.000Z',
  } as const;
  const responseMessage = {
    ...message,
    sequence: 4,
    datasetVersionId: ids.datasetVersion,
  };
  const versionAuthority = {
    authorizeDatasetVersion: async () => Object.freeze({ allowed: true as const }),
  };
  const { controller } = createController(
    context(),
    undefined,
    {
      load: {
        accepted: true as const,
        value: { conversation, messages: [responseMessage], contextEvents: [contextEvent] },
      },
    },
    undefined,
    versionAuthority,
  );
  const loaded = await controller.load({}, ids.conversation, { limit: '20' });
  assert.deepEqual(loaded, {
    schemaVersion: 4,
    accepted: true,
    conversation: {
      schemaVersion: 4,
      conversationId: ids.conversation,
      title: 'Sales questions',
      datasets: [{ datasetId: ids.dataset, datasetVersionId: ids.datasetVersion }],
      dashboardId: ids.dashboard,
      filterContext: 'month = 8',
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
    messages: [
      {
        messageId: ids.message,
        conversationId: ids.conversation,
        role: 'USER',
        text: 'Hello',
        sequence: 4,
        datasetVersionId: ids.datasetVersion,
        createdAt: '2026-08-13T00:00:00.000Z',
      },
    ],
    contextEvents: [
      {
        eventId: ids.message,
        conversationId: ids.conversation,
        kind: 'DATASET_VERSION_ADVANCED',
        datasetId: ids.dataset,
        beforeVersionId: ids.datasetVersion,
        afterVersionId: ids.datasetVersion,
        sequence: 2,
        occurredAt: '2026-08-13T00:00:02.000Z',
      },
    ],
  });
});

void test('[DDA-055][DDA-056] context events are omitted when their dataset is no longer authorized', async () => {
  const contextEvent = {
    eventId: ids.message,
    conversationId: ids.conversation,
    tenantScope: context().tenantScope,
    kind: 'DATASET_DETACHED',
    datasetId: ids.secondDataset,
    sequence: 2,
    occurredAt: '2026-08-13T00:00:02.000Z',
  } as const;
  const authorityCalls: unknown[] = [];
  const authority: AgentAuthorityPortV1 = {
    authorize: async (input) => {
      authorityCalls.push(input);
      return input.datasetIds.includes(ids.secondDataset)
        ? Object.freeze({ allowed: false as const, code: 'DATASET_RESTRICTED' as const })
        : Object.freeze({
            allowed: true as const,
            effectiveAgentLevel: 'ANALYZE' as const,
            accessPreset: 'EDITOR' as const,
            deniedDatasetIds: Object.freeze([] as string[]),
          });
    },
  };
  const { controller } = createController(
    context(),
    undefined,
    {
      load: {
        accepted: true as const,
        value: { conversation, messages: [message], contextEvents: [contextEvent] },
      },
    },
    authority,
  );

  const loaded = await controller.load({}, ids.conversation, { limit: '20' });
  assert.deepEqual(loaded.contextEvents, []);
  assert.deepEqual(authorityCalls, [
    { context: context(), datasetIds: [ids.dataset] },
    { context: context(), datasetIds: [ids.secondDataset] },
  ]);
});

void test('[IAM-024] every malformed allowed agent decision variant fails closed before ConversationService', async () => {
  const malformedDecisions: readonly unknown[] = [
    {
      allowed: true,
      effectiveAgentLevel: 'INVALID',
      accessPreset: 'EDITOR',
      deniedDatasetIds: [],
    },
    {
      allowed: true,
      effectiveAgentLevel: 'ANALYZE',
      accessPreset: 'invalid',
      deniedDatasetIds: [],
    },
    {
      allowed: true,
      effectiveAgentLevel: 'ANALYZE',
      accessPreset: 'EDITOR',
      deniedDatasetIds: ['not-a-stable-id'],
    },
    { allowed: false, code: 'NOT_A_REAL_AGENT_CODE' },
  ];

  for (const malformedDecision of malformedDecisions) {
    const authority: AgentAuthorityPortV1 = {
      authorize: async () => malformedDecision as never,
    };
    const { controller, calls } = createController(context(), undefined, {}, authority);
    await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 503));
    assert.equal(calls.create.length, 0);
  }
});

void test('[IAM-024] the default dataset-version authority is unavailable and fails closed', async () => {
  const calls: unknown[] = [];
  const service = {
    async createConversation(...input: unknown[]) {
      calls.push(input);
      return { accepted: true as const, value: conversation };
    },
  } as unknown as ConversationService;
  const Controller = ConversationController as unknown as new (
    ...args: unknown[]
  ) => ConversationController;
  const controller = new Controller(
    service,
    { resolve: async () => context() },
    {
      authorize: async () =>
        Object.freeze({
          allowed: true as const,
          effectiveAgentLevel: 'ANALYZE' as const,
          accessPreset: 'EDITOR' as const,
          deniedDatasetIds: Object.freeze([] as string[]),
        }),
    },
  );

  await assert.rejects(controller.create({}, createDto), (error) => assertHttpStatus(error, 503));
  assert.equal(calls.length, 0);
});

void test('[DDA-055] corrupt persisted conversation or message rows fail closed with safe 503', async () => {
  const corruptConversation = { ...conversation, title: 'x'.repeat(201) };
  const listController = createController(context(), undefined, {
    list: { accepted: true as const, value: [corruptConversation] },
  }).controller;
  await assert.rejects(listController.list({}, { limit: '20' }), (error) =>
    assertHttpStatus(error, 503),
  );

  const corruptMessage = { ...message, role: 'NOT_A_ROLE' };
  const loadController = createController(context(), undefined, {
    load: { accepted: true as const, value: { conversation, messages: [corruptMessage] } },
  }).controller;
  await assert.rejects(loadController.load({}, ids.conversation, { limit: '20' }), (error) =>
    assertHttpStatus(error, 503),
  );

  const missingInternalMessageField = { ...message, idempotencyKey: undefined };
  const missingInternalFieldController = createController(context(), undefined, {
    load: {
      accepted: true as const,
      value: { conversation, messages: [missingInternalMessageField] },
    },
  }).controller;
  await assert.rejects(
    missingInternalFieldController.load({}, ids.conversation, { limit: '20' }),
    (error) => assertHttpStatus(error, 503),
  );
});

void test('[DDA-026][DDA-055][DDA-056] cross-tenant conversation reads fail closed against the authenticated scope', async () => {
  const repository = new InMemoryConversationRepositoryAdapter();
  const service = new ConversationService(repository);
  let currentContext = context();
  const requestContext: RequestTenantContextPortV1 = {
    resolve: async () => currentContext,
  };
  const Controller = ConversationController as unknown as new (
    ...args: unknown[]
  ) => ConversationController;
  const controller = new Controller(
    service,
    requestContext,
    {
      authorize: async () =>
        Object.freeze({
          allowed: true as const,
          effectiveAgentLevel: 'ANALYZE' as const,
          accessPreset: 'EDITOR' as const,
          deniedDatasetIds: Object.freeze([] as string[]),
        }),
    },
    {
      authorizeDatasetVersion: async () => Object.freeze({ allowed: true as const }),
    },
  );

  const created = await controller.create({}, createDto);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  currentContext = context(ids.otherOrganization, ids.otherWorkspace);
  const listed = await controller.list({}, { limit: '20' });
  assert.deepEqual(listed.items, []);
  await assert.rejects(controller.load({}, created.conversationId, { limit: '20' }), (error) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 404);
    assert.deepEqual(error.getResponse(), { error: 'CONVERSATION_REJECTED' });
    return true;
  });
});
