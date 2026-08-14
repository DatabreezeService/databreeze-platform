/* eslint-disable @typescript-eslint/require-await -- test doubles mirror async application ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentProviderPortV1 } from '../../../src/features/dda/agent/application/agent-provider.port.js';
import { AgentContextBuilderService } from '../../../src/features/dda/agent/application/agent-context-builder.service.js';
import { AgentToolRegistryV1 } from '../../../src/features/dda/agent/application/agent-tool-registry.js';
import { AgentTurnService } from '../../../src/features/dda/agent/application/agent-turn.service.js';
import type {
  AgentAuthorityPortV1,
  AgentToolExecutorPortV1,
  AgentUsagePortV1,
} from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import { TypedAgentToolExecutorAdapter } from '../../../src/features/dda/agent/adapter/typed-agent-tool-executor.adapter.js';
import { InMemoryConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/in-memory-conversation-repository.adapter.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  otherWorkspace: '00000000-0000-4000-8000-000000000099',
  actor: '00000000-0000-4000-8000-000000000003',
  correlation: '00000000-0000-4000-8000-000000000004',
  dataset: '00000000-0000-4000-8000-000000000005',
  datasetVersion: '00000000-0000-4000-8000-000000000006',
  plan: '00000000-0000-4000-8000-000000000007',
  planVersion: '00000000-0000-4000-8000-000000000008',
  dashboard: '00000000-0000-4000-8000-000000000009',
  command: '00000000-0000-4000-8000-000000000010',
  preview: '00000000-0000-4000-8000-000000000011',
});

const tenantScope = Object.freeze({
  scopeType: 'workspace' as const,
  organizationId: ids.organization,
  workspaceId: ids.workspace,
});

const context = Object.freeze({
  tenantScope,
  actorId: ids.actor,
  correlationId: ids.correlation,
  idempotencyKey: 'request-1',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
}) as IamTenantContextV1;

function allowAuthority(): AgentAuthorityPortV1 {
  return {
    async authorize() {
      return Object.freeze({
        allowed: true as const,
        effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES' as const,
        accessPreset: 'EDITOR' as const,
        deniedDatasetIds: Object.freeze([]),
      });
    },
  };
}

function allowUsage(): AgentUsagePortV1 {
  return {
    async admit() {
      return Object.freeze({ allowed: true as const });
    },
  };
}

async function seedConversation(conversations: ConversationService): Promise<string> {
  const created = await conversations.createConversation(
    { tenantScope: tenantScope as never, memberAuthorized: true },
    {
      title: 'Security regression',
      datasetIds: [ids.dataset],
      datasetVersionIds: { [ids.dataset]: ids.datasetVersion },
    },
    `seed-${Math.random()}`,
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('conversation seed failed');
  return created.value.conversationId;
}

void test('[DDA-060][IAM-002] an agent grant cannot authorize a tool action without the IAM action port', async () => {
  const repository = new InMemoryConversationRepositoryAdapter();
  const conversations = new ConversationService(repository);
  const conversationId = await seedConversation(conversations);
  let toolUsageCalled = false;
  let executorCalled = false;
  let actionCall: Record<string, unknown> | undefined;

  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: '',
          toolCalls: [
            {
              toolCallId: 'tool-1',
              name: 'dataset.describe',
              input: { datasetId: ids.dataset },
            },
          ],
        },
      };
    },
  };
  const usage: AgentUsagePortV1 = {
    async admit(input) {
      if (input.descriptor !== undefined) toolUsageCalled = true;
      return { allowed: true };
    },
  };
  const executor: AgentToolExecutorPortV1 = {
    async execute() {
      executorCalled = true;
      return { accepted: true, value: { datasetId: ids.dataset } };
    },
  };
  const actionAuthorization = {
    async authorize(input: Record<string, unknown>) {
      actionCall = input;
      return { allowed: false as const, code: 'UNAUTHORIZED' as const };
    },
  };

  const service = new AgentTurnService({
    conversations,
    conversationRepository: repository,
    registry: new AgentToolRegistryV1(),
    contextBuilder: new AgentContextBuilderService(),
    provider,
    authority: allowAuthority(),
    usage,
    executor,
    iamActionAuthorization: actionAuthorization,
  } as never);

  const result = await service.runTurn({
    context,
    conversationId,
    messageId: '00000000-0000-4000-8000-000000000012',
    text: 'Describe the dataset.',
    idempotencyKey: 'turn-action-only-denial',
    locale: 'en',
  });

  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
  assert.equal(toolUsageCalled, false);
  assert.equal(executorCalled, false);
  assert.equal(actionCall?.['context'], context);
  assert.deepEqual(actionCall?.['resourceIds'], [ids.dataset]);
  assert.equal(
    (actionCall?.['descriptor'] as { readonly requiredIamAction?: string } | undefined)
      ?.requiredIamAction,
    'artifact.record.read',
  );
});

void test('[DDA-043][DDA-055] raw tool inputs and results never reach the next provider prompt through history', async () => {
  const repository = new InMemoryConversationRepositoryAdapter();
  const conversations = new ConversationService(repository);
  const conversationId = await seedConversation(conversations);
  const providerInputs: readonly unknown[] = [];
  let turn = 0;
  const provider: AgentProviderPortV1 = {
    async completeTurn(input) {
      (providerInputs as unknown as unknown[]).push(input);
      turn += 1;
      return turn === 1
        ? {
            accepted: true as const,
            value: {
              narrative: 'A bounded result is ready.',
              toolCalls: [
                {
                  toolCallId: 'tool-raw-result',
                  name: 'dataset.describe',
                  input: { datasetId: ids.dataset },
                },
              ],
            },
          }
        : {
            accepted: true as const,
            value: { narrative: 'Continue.', toolCalls: [] },
          };
    },
  };
  const executor: AgentToolExecutorPortV1 = {
    async execute() {
      return {
        accepted: true,
        value: {
          rows: [{ amount: 987654321, secret: 'sk-live-secret-shaped' }],
          cells: [{ numericValue: 987654321 }],
          localPath: 'C:\\private\\receipts\\march.csv',
          ocrText: 'MUA HANG NOI DUNG NGUYEN BAN',
          resultId: ids.plan,
        },
      };
    },
  };
  const service = new AgentTurnService({
    conversations,
    conversationRepository: repository,
    registry: new AgentToolRegistryV1(),
    contextBuilder: new AgentContextBuilderService(),
    provider,
    authority: allowAuthority(),
    usage: allowUsage(),
    executor,
    iamActionAuthorization: {
      async authorize() {
        return { allowed: true as const };
      },
    },
  });

  await service.runTurn({
    context,
    conversationId,
    messageId: '00000000-0000-4000-8000-000000000013',
    text: 'First bounded question.',
    idempotencyKey: 'turn-history-1',
    locale: 'en',
  });
  const second = await service.runTurn({
    context,
    conversationId,
    messageId: '00000000-0000-4000-8000-000000000014',
    text: 'Second bounded question.',
    idempotencyKey: 'turn-history-2',
    locale: 'en',
  });

  assert.equal(second.accepted, true);
  const secondProviderInput = providerInputs[1] as {
    readonly contextPackage: unknown;
    readonly userText: string;
  };
  const serialized = JSON.stringify(secondProviderInput);
  assert.doesNotMatch(serialized, /987654321|sk-live-secret-shaped|private\\receipts|MUA HANG/iu);
  assert.doesNotMatch(serialized, /"rows"|"cells"|"numericValue"|"localPath"|"ocrText"/u);
});

type ConsequentialCommandInput = {
  readonly context: IamTenantContextV1;
  readonly descriptor: { readonly name: string };
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly audit: (outcome: 'ATTEMPTED' | 'SUCCEEDED') => Promise<boolean>;
  readonly perform: () => Promise<{
    readonly accepted: boolean;
    readonly value?: unknown;
    readonly code?: string;
  }>;
};

function dashboardMutationDependencies(options: {
  readonly commandPort: { execute(input: ConsequentialCommandInput): Promise<unknown> };
  readonly contextOverride?: IamTenantContextV1;
  readonly previewCommandId?: string;
  readonly idempotencyKey?: string;
  readonly delayMs?: number;
  readonly timeoutMs?: number;
  readonly audit?: { emitContentSafeSummary(): Promise<void> };
}) {
  let effectCount = 0;
  const baseRegistry = new AgentToolRegistryV1();
  const descriptorResult = baseRegistry.resolve('dashboard.applyConfirmed');
  assert.equal(descriptorResult.accepted, true);
  if (!descriptorResult.accepted) throw new Error('missing mutation descriptor');
  const descriptor =
    options.timeoutMs === undefined
      ? descriptorResult.value
      : Object.freeze({ ...descriptorResult.value, timeoutMs: options.timeoutMs });
  const registry = {
    resolve(name: string) {
      if (name === 'dashboard.applyConfirmed')
        return { accepted: true as const, value: descriptor };
      return baseRegistry.resolve(name);
    },
  };
  const dependencies = {
    registry,
    authority: allowAuthority(),
    iamActionAuthorization: {
      async authorize() {
        return { allowed: true as const };
      },
    },
    audit: options.audit ?? { async emitContentSafeSummary() {} },
    dashboardPreview: {
      async resolve() {
        return {
          accepted: true as const,
          value: {
            previewCommandId: options.previewCommandId ?? ids.preview,
            expectedVersion: 1,
            revision: 1,
            idempotencyKey: options.idempotencyKey ?? 'mutation-key',
            dashboardId: ids.dashboard,
            command: { commandId: ids.command },
          },
        };
      },
    },
    dashboardDraftService: {
      async applyAuthoringCommand() {
        if (options.delayMs !== undefined) {
          await new Promise<void>((resolve) => setTimeout(resolve, options.delayMs));
        }
        effectCount += 1;
        return {
          accepted: true as const,
          value: { commandId: ids.command, revision: 2, publishes: false },
        };
      },
    },
    consequentialCommand: options.commandPort,
  };
  const request = {
    context: options.contextOverride ?? context,
    descriptor,
    input: {
      previewCommandId: options.previewCommandId ?? ids.preview,
      userConfirmation: true,
      expectedVersion: 1,
      revision: 1,
      idempotencyKey: options.idempotencyKey ?? 'mutation-key',
    },
    authority: {
      allowed: true as const,
      effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES' as const,
      accessPreset: 'EDITOR' as const,
      deniedDatasetIds: [],
    },
    correlationId: '00000000-0000-4000-8000-000000000015',
  };
  return {
    effectCount: () => effectCount,
    executor: new TypedAgentToolExecutorAdapter(dependencies as never),
    request,
  };
}

void test('[DDA-045][DDA-060] shared durable command state replays across instances, isolates tenants, and conflicts on fingerprint reuse', async () => {
  type CommandRecord =
    | { readonly fingerprint: string; readonly result: unknown }
    | { readonly fingerprint: string; readonly pending: Promise<unknown> };
  const records = new Map<string, CommandRecord>();
  const commandPort = {
    async execute(input: ConsequentialCommandInput) {
      const scope = input.context.tenantScope as {
        readonly organizationId: string;
        readonly workspaceId?: string;
      };
      const key = `${scope.organizationId}:${scope.workspaceId}:${input.context.actorId}:${input.descriptor.name}:${input.idempotencyKey}`;
      const existing = records.get(key);
      if (existing && existing.fingerprint !== input.inputFingerprint) {
        return { accepted: false, code: 'IDEMPOTENCY_CONFLICT' };
      }
      if (existing && 'result' in existing) return existing.result;
      if (existing) return existing.pending;
      const pending = (async () => {
        if (!(await input.audit('ATTEMPTED'))) {
          return { accepted: false, code: 'PROVIDER_FAILURE' };
        }
        const result = await input.perform();
        if (!result.accepted) return result;
        if (!(await input.audit('SUCCEEDED'))) {
          return { accepted: false, code: 'PROVIDER_FAILURE' };
        }
        records.set(key, { fingerprint: input.inputFingerprint, result });
        return result;
      })();
      records.set(key, { fingerprint: input.inputFingerprint, pending });
      return pending;
    },
  };
  const first = dashboardMutationDependencies({ commandPort });
  const firstResult = await first.executor.execute(first.request as never);
  assert.equal(firstResult.accepted, true);

  const restarted = dashboardMutationDependencies({ commandPort });
  const replay = await restarted.executor.execute(restarted.request as never);
  assert.deepEqual(replay, firstResult);
  assert.equal(first.effectCount(), 1);
  assert.equal(restarted.effectCount(), 0);

  const conflict = dashboardMutationDependencies({ commandPort, previewCommandId: ids.command });
  const conflictResult = await conflict.executor.execute(conflict.request as never);
  assert.deepEqual(conflictResult, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(conflict.effectCount(), 0);

  const otherTenant = dashboardMutationDependencies({
    commandPort,
    contextOverride: {
      ...context,
      tenantScope: { ...tenantScope, workspaceId: ids.otherWorkspace } as never,
    } as IamTenantContextV1,
  });
  const otherTenantResult = await otherTenant.executor.execute(otherTenant.request as never);
  assert.equal(otherTenantResult.accepted, true);
  assert.equal(otherTenant.effectCount(), 1);

  const concurrentA = dashboardMutationDependencies({
    commandPort,
    idempotencyKey: 'concurrent-key',
  });
  const concurrentB = dashboardMutationDependencies({
    commandPort,
    idempotencyKey: 'concurrent-key',
  });
  const concurrentResults = await Promise.all([
    concurrentA.executor.execute(concurrentA.request as never),
    concurrentB.executor.execute(concurrentB.request as never),
  ]);
  assert.deepEqual(concurrentResults[0], concurrentResults[1]);
  assert.equal(concurrentA.effectCount() + concurrentB.effectCount(), 1);
});

void test('[DDA-045][DDA-060] a late mutation does not become a false timeout after the durable boundary accepts it', async () => {
  let auditCalls = 0;
  const commandPort = {
    async execute(input: ConsequentialCommandInput) {
      const auditAttempted = await input.audit('ATTEMPTED');
      if (!auditAttempted) return { accepted: false, code: 'PROVIDER_FAILURE' };
      const result = await input.perform();
      const completed = result.accepted && (await input.audit('SUCCEEDED'));
      auditCalls += 2;
      if (!completed) return { accepted: false, code: 'PROVIDER_FAILURE' };
      return result;
    },
  };
  const harness = dashboardMutationDependencies({ commandPort, delayMs: 25, timeoutMs: 5 });
  const original = (harness.executor as unknown as { readonly deps?: unknown }).deps;
  void original;
  const result = await harness.executor.execute(harness.request as never);
  assert.equal(result.accepted, true);
  assert.equal(harness.effectCount(), 1);
  assert.equal(auditCalls, 2);
});

void test('[DDA-045][DDA-060] mutation audit failure prevents the side effect and fails closed', async () => {
  let performed = 0;
  const commandPort = {
    async execute(input: ConsequentialCommandInput) {
      if (!(await input.audit('ATTEMPTED'))) {
        return { accepted: false, code: 'PROVIDER_FAILURE' };
      }
      performed += 1;
      return input.perform();
    },
  };
  const harness = dashboardMutationDependencies({
    commandPort,
    audit: {
      async emitContentSafeSummary() {
        throw new Error('audit unavailable');
      },
    },
  });
  const result = await harness.executor.execute(harness.request as never);
  assert.deepEqual(result, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal(performed, 0);
  assert.equal(harness.effectCount(), 0);
});
