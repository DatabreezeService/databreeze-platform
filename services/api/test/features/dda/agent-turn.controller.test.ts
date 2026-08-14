/* eslint-disable @typescript-eslint/require-await -- controller fakes mirror async services. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  AgentTurnController,
  AgentTurnProblemError,
  agentTurnProblemStatus,
} from '../../../src/features/dda/agent/api/agent-turn.controller.js';
import { AgentTurnService } from '../../../src/features/dda/agent/application/agent-turn.service.js';
import type { AgentTurnProblemCodeV1 } from '../../../src/features/dda/agent/application/agent-tool.types.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const context = {
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
  },
  actorId: '00000000-0000-0000-0000-000000000003',
  correlationId: '00000000-0000-0000-0000-000000000004',
  idempotencyKey: 'request-1',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
} as IamTenantContextV1;

function createController() {
  const calls: unknown[] = [];
  const service = {
    async runTurn(input: unknown) {
      calls.push(input);
      return { accepted: true as const, value: { narrative: 'ok', toolResults: [] } };
    },
    async executeDeterministicTool(input: unknown) {
      calls.push(input);
      return { accepted: true as const, value: { ok: true } };
    },
  } as unknown as AgentTurnService;
  const requestContext: RequestTenantContextPortV1 = {
    async resolve() {
      return context;
    },
  };
  const Controller = AgentTurnController as unknown as new (
    ...args: unknown[]
  ) => AgentTurnController;
  return { controller: new Controller(service, requestContext), calls };
}

void test('[DDA-060][IAM-017] turn controller resolves tenant authority from request context', async () => {
  const { controller, calls } = createController();
  const runTurn = controller.runTurn.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;
  const response = await runTurn(
    { headers: { authorization: 'Bearer token' } },
    {
      schemaVersion: 4,
      conversationId: '00000000-0000-0000-0000-000000000010',
      messageId: '00000000-0000-0000-0000-000000000011',
      text: 'hello',
      idempotencyKey: 'turn-0001',
      locale: 'en',
      contextRevision: 2,
      expectedContextRevision: 2,
    },
  );

  assert.deepEqual(response, {
    schemaVersion: 4,
    accepted: true,
    narrative: 'ok',
    toolResults: [],
  });

  assert.deepEqual(calls, [
    {
      context,
      conversationId: '00000000-0000-0000-0000-000000000010',
      messageId: '00000000-0000-0000-0000-000000000011',
      text: 'hello',
      idempotencyKey: 'turn-0001',
      locale: 'en',
      contextRevision: 2,
      expectedContextRevision: 2,
    },
  ]);
});

void test('[DDA-060][IAM-017] turn controller rejects browser authority fields', async () => {
  const { controller, calls } = createController();
  const runTurn = controller.runTurn.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;

  await assert.rejects(() =>
    runTurn(
      {},
      {
        schemaVersion: 4,
        conversationId: '00000000-0000-0000-0000-000000000010',
        messageId: '00000000-0000-0000-0000-000000000011',
        text: 'escalate',
        idempotencyKey: 'turn-2',
        locale: 'en',
        tenantScope: context.tenantScope,
        memberAuthorized: true,
        agentLevel: 'APPLY_CONFIRMED_CHANGES',
      },
    ),
  );
  assert.equal(calls.length, 0);
});

void test('[DDA-060][IAM-017] authority fields in the transport request body are rejected', async () => {
  const { controller, calls } = createController();
  const runTurn = controller.runTurn.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;

  await assert.rejects(() =>
    runTurn(
      {
        body: { agentLevel: 'APPLY_CONFIRMED_CHANGES' },
        query: {},
        params: {},
      },
      {
        schemaVersion: 4,
        conversationId: '00000000-0000-0000-0000-000000000010',
        messageId: '00000000-0000-0000-0000-000000000011',
        text: 'hello',
        idempotencyKey: 'turn-3',
        locale: 'en',
      },
    ),
  );
  assert.equal(calls.length, 0);
});

void test('[DDA-060][IAM-017] deterministic tool input is allowed but authority fields are rejected', async () => {
  const { controller, calls } = createController();
  const execute = controller.executeDeterministic.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;

  await assert.rejects(() =>
    execute(
      {},
      {
        conversationId: '00000000-0000-0000-0000-000000000010',
        toolName: 'dataset.describe',
        idempotencyKey: 'tool-1',
        input: { datasetId: '00000000-0000-0000-0000-000000000012' },
        agentLevel: 'APPLY_CONFIRMED_CHANGES',
      },
    ),
  );
  assert.equal(calls.length, 0);
});

void test('[DDA-060][HTTP] rejected agent results map to content-safe HTTP statuses', () => {
  const expected: readonly [AgentTurnProblemCodeV1, number][] = [
    ['UNAUTHORIZED', 403],
    ['INSUFFICIENT_AGENT_LEVEL', 403],
    ['DATASET_RESTRICTED', 403],
    ['EVIDENCE_UNAUTHORIZED', 403],
    ['CONVERSATION_NOT_FOUND', 404],
    ['BUDGET_DENIED', 429],
    ['PROVIDER_DISABLED', 503],
    ['PROVIDER_TIMEOUT', 503],
    ['PROVIDER_FAILURE', 503],
    ['STALE_CONTEXT', 409],
    ['MALFORMED_TOOL_CALL', 400],
    ['UNKNOWN_TOOL', 400],
    ['OVER_BOUND_SAMPLE', 422],
    ['TOOL_LOOP_LIMIT', 422],
    ['REPEATED_TOOL_CALL', 422],
    ['UNCONFIRMED_DASHBOARD_APPLY', 422],
  ];

  for (const [code, status] of expected) {
    assert.equal(agentTurnProblemStatus(code), status, code);
    const error = new AgentTurnProblemError(code);
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), status);
    assert.deepEqual(error.getResponse(), { error: 'AGENT_TURN_REJECTED' });
  }
});

void test('[DDA-060][HTTP] provider rejection from the turn route is not surfaced as a 500', async () => {
  const calls: unknown[] = [];
  const service = {
    async runTurn(input: unknown) {
      calls.push(input);
      return { accepted: false as const, code: 'PROVIDER_FAILURE' as const };
    },
    async executeDeterministicTool() {
      return { accepted: true as const, value: { ok: true } };
    },
  } as unknown as AgentTurnService;
  const requestContext: RequestTenantContextPortV1 = {
    async resolve() {
      return context;
    },
  };
  const Controller = AgentTurnController as unknown as new (
    ...args: unknown[]
  ) => AgentTurnController;
  const controller = new Controller(service, requestContext);
  const runTurn = controller.runTurn.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;
  const statuses: number[] = [];
  const reply = {
    code(status: number) {
      statuses.push(status);
      return reply;
    },
  } as unknown as FastifyReply;

  const response = await runTurn(
    {},
    {
      schemaVersion: 4,
      conversationId: '00000000-0000-0000-0000-000000000010',
      messageId: '00000000-0000-0000-0000-000000000011',
      text: 'hello',
      idempotencyKey: 'turn-provider-failure',
      locale: 'en',
    },
    reply,
  );
  assert.deepEqual(response, { error: 'AGENT_TURN_REJECTED' });
  assert.deepEqual(statuses, [503]);
  assert.equal(calls.length, 1);
});

void test('[DDA-060] malformed accepted service output fails closed instead of escaping the generated contract', async () => {
  const service = {
    async runTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: 'unsafe',
          toolResults: [{ toolCallId: 'call-1', name: 'analysis.execute', result: { value: 42 } }],
        },
      };
    },
  } as unknown as AgentTurnService;
  const Controller = AgentTurnController as unknown as new (
    ...args: unknown[]
  ) => AgentTurnController;
  const controller = new Controller(service, { resolve: async () => context });
  const runTurn = controller.runTurn.bind(controller) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;

  await assert.rejects(
    runTurn(
      {},
      {
        schemaVersion: 4,
        conversationId: '00000000-0000-0000-0000-000000000010',
        messageId: '00000000-0000-0000-0000-000000000011',
        text: 'hello',
        idempotencyKey: 'turn-malformed-result',
        locale: 'en',
      },
    ),
    (error) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 503);
      return true;
    },
  );
});
