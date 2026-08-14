/* eslint-disable @typescript-eslint/require-await -- test doubles mirror async authority ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenAiAgentProviderAdapter } from '../../../src/features/dda/agent/adapter/openai-agent-provider.adapter.js';
import type { AgentProviderPortV1 } from '../../../src/features/dda/agent/application/agent-provider.port.js';
import { AgentToolRegistryV1 } from '../../../src/features/dda/agent/application/agent-tool-registry.js';
import { AgentContextBuilderService } from '../../../src/features/dda/agent/application/agent-context-builder.service.js';
import { AgentTurnService } from '../../../src/features/dda/agent/application/agent-turn.service.js';
import { InMemoryConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/in-memory-conversation-repository.adapter.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

const tenantContext = {
  tenantScope,
  actorId: '00000000-0000-4000-8000-000000000003',
  correlationId: '00000000-0000-4000-8000-000000000004',
  idempotencyKey: 'request-1',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
} as unknown as IamTenantContextV1;

const datasetId = '00000000-0000-4000-8000-000000000701';
const datasetVersionId = '00000000-0000-4000-8000-000000000702';

type AgentLevel = 'NONE' | 'ANALYZE' | 'PROPOSE_CHANGES' | 'APPLY_CONFIRMED_CHANGES';
type Descriptor = {
  readonly name: string;
  readonly requiredAgentLevel: AgentLevel;
  readonly requiredIamAction: string;
  readonly requiresUserConfirmation: boolean;
};
type AuthorityDecision =
  | {
      readonly allowed: true;
      readonly effectiveAgentLevel: AgentLevel;
      readonly accessPreset: 'OWNER' | 'EDITOR' | 'VIEWER';
      readonly deniedDatasetIds: readonly string[];
    }
  | { readonly allowed: false; readonly code: string };

function createHarness(options?: {
  readonly agentLevel?: AgentLevel;
  readonly deniedDatasetIds?: readonly string[];
  readonly usageDenied?: boolean;
  readonly provider?: AgentProviderPortV1;
}) {
  const repository = new InMemoryConversationRepositoryAdapter();
  const conversations = new ConversationService(repository);
  const registry = new AgentToolRegistryV1();
  const authorityCalls: {
    readonly context: IamTenantContextV1;
    readonly descriptor?: Descriptor;
  }[] = [];
  const usageCalls: { readonly descriptor?: Descriptor }[] = [];
  const executed: { readonly name: string; readonly context: IamTenantContextV1 }[] = [];
  const level = options?.agentLevel ?? 'ANALYZE';
  const order: Record<AgentLevel, number> = {
    NONE: 0,
    ANALYZE: 1,
    PROPOSE_CHANGES: 2,
    APPLY_CONFIRMED_CHANGES: 3,
  };

  const authority = {
    async authorize(input: {
      readonly context: IamTenantContextV1;
      readonly descriptor?: Descriptor;
      readonly datasetIds: readonly string[];
      readonly input?: Readonly<Record<string, unknown>>;
    }): Promise<AuthorityDecision> {
      authorityCalls.push({
        context: input.context,
        ...(input.descriptor === undefined ? {} : { descriptor: input.descriptor }),
      });
      if ((input.context.tenantScope as unknown) !== tenantScope) {
        return { allowed: false, code: 'UNAUTHORIZED' };
      }
      if (level === 'NONE') return { allowed: false, code: 'INSUFFICIENT_AGENT_LEVEL' };
      if (input.datasetIds.some((id) => (options?.deniedDatasetIds ?? []).includes(id))) {
        return { allowed: false, code: 'DATASET_RESTRICTED' };
      }
      if (
        input.descriptor !== undefined &&
        order[level] < order[input.descriptor.requiredAgentLevel]
      ) {
        return { allowed: false, code: 'INSUFFICIENT_AGENT_LEVEL' };
      }
      if (
        input.descriptor?.requiresUserConfirmation === true &&
        input.input?.['userConfirmation'] !== true
      ) {
        return { allowed: false, code: 'UNCONFIRMED_DASHBOARD_APPLY' };
      }
      return {
        allowed: true,
        effectiveAgentLevel: level,
        accessPreset: 'EDITOR',
        deniedDatasetIds: options?.deniedDatasetIds ?? [],
      };
    },
  };

  const usage = {
    async admit(input: { readonly descriptor?: Descriptor }) {
      usageCalls.push(input);
      return options?.usageDenied
        ? ({ allowed: false, code: 'BUDGET_DENIED' } as const)
        : ({ allowed: true } as const);
    },
  };

  const executor = {
    async execute(input: {
      readonly context: IamTenantContextV1;
      readonly descriptor: Descriptor;
    }) {
      executed.push({ name: input.descriptor.name, context: input.context });
      return {
        accepted: true as const,
        value: { cells: [{ cellId: 'c1', numericValue: 42 }], evidenceRefs: ['e1'] },
      };
    },
  };

  const provider: AgentProviderPortV1 =
    options?.provider ??
    ({
      async completeTurn() {
        return {
          accepted: true as const,
          value: { narrative: 'Da doc.', toolCalls: [] },
        };
      },
    } satisfies AgentProviderPortV1);

  const service = new AgentTurnService({
    conversations,
    conversationRepository: repository,
    registry,
    contextBuilder: new AgentContextBuilderService(),
    provider,
    authority,
    usage,
    executor,
    iamActionAuthorization: {
      async authorize() {
        return { allowed: true as const };
      },
    },
  } as never);

  return { conversations, service, authorityCalls, usageCalls, executed };
}

async function seedConversation(conversations: ConversationService): Promise<string> {
  const created = await conversations.createConversation(
    { tenantScope, memberAuthorized: true },
    {
      title: 'Agent turn',
      datasetIds: [datasetId],
      datasetVersionIds: { [datasetId]: datasetVersionId },
    },
    'seed-1',
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('seed failed');
  return created.value.conversationId;
}

function turnInput(conversationId: string) {
  return {
    context: tenantContext,
    conversationId,
    messageId: '00000000-0000-4000-8000-000000000801',
    text: 'Tong doanh thu la bao nhieu?',
    idempotencyKey: 'turn-1',
    locale: 'vi-VN',
  };
}

void test('[DDA-060][IAM-017] client authority fields cannot select tenant or effective agent level', async () => {
  const { conversations, service, authorityCalls } = createHarness();
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn({
    ...turnInput(conversationId),
    tenantScope: { scopeType: 'workspace', organizationId: 'attacker', workspaceId: 'attacker' },
    memberAuthorized: true,
    agentLevel: 'APPLY_CONFIRMED_CHANGES',
  } as never);

  assert.equal(result.accepted, true);
  assert.equal(authorityCalls[0]?.context, tenantContext);
});

void test('[DDA-060][IAM-024] Viewer NONE is denied before provider use', async () => {
  let providerCalled = false;
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      providerCalled = true;
      return { accepted: true as const, value: { narrative: 'no', toolCalls: [] } };
    },
  };
  const { conversations, service } = createHarness({ agentLevel: 'NONE', provider });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'INSUFFICIENT_AGENT_LEVEL' });
  assert.equal(providerCalled, false);
});

void test('[DDA-060][IAM-024] restricted dataset is denied by server authority', async () => {
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: '',
          toolCalls: [{ toolCallId: 'tc-1', name: 'dataset.describe', input: { datasetId } }],
        },
      };
    },
  };
  const { conversations, service, executed } = createHarness({
    provider,
    deniedDatasetIds: [datasetId],
  });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'DATASET_RESTRICTED' });
  assert.equal(executed.length, 0);
});

void test('[DDA-060][DDA-024] unconfirmed apply is denied before typed executor', async () => {
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: '',
          toolCalls: [
            {
              toolCallId: 'tc-2',
              name: 'dashboard.applyConfirmed',
              input: {
                previewCommandId: datasetVersionId,
                userConfirmation: false,
                expectedVersion: 1,
                revision: 1,
                idempotencyKey: 'apply-1',
              },
            },
          ],
        },
      };
    },
  };
  const { conversations, service, executed } = createHarness({
    provider,
    agentLevel: 'APPLY_CONFIRMED_CHANGES',
  });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'UNCONFIRMED_DASHBOARD_APPLY' });
  assert.equal(executed.length, 0);
});

void test('[DDA-060][BUA-005] usage denial happens before provider and executor', async () => {
  let providerCalled = false;
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      providerCalled = true;
      return { accepted: true as const, value: { narrative: '', toolCalls: [] } };
    },
  };
  const { conversations, service } = createHarness({ provider, usageDenied: true });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'BUDGET_DENIED' });
  assert.equal(providerCalled, false);
});

void test('[DDA-060][DDA-043] unknown hostile provider tool never reaches authority or executor', async () => {
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: '',
          toolCalls: [
            {
              toolCallId: 'tc-hostile',
              name: 'shell.execute',
              input: { command: 'rm -rf /', databaseClient: 'secret' },
            },
          ],
        },
      };
    },
  };
  const { conversations, service, authorityCalls, executed } = createHarness({ provider });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'UNKNOWN_TOOL' });
  assert.equal(authorityCalls.length, 1);
  assert.equal(executed.length, 0);
});

void test('[DDA-060][DDA-043] typed tool input rejects nested raw query and executable payloads', async () => {
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: '',
          toolCalls: [
            {
              toolCallId: 'tc-nested-hostile',
              name: 'analysis.execute',
              input: {
                planId: datasetVersionId,
                datasetId,
                datasetVersionId,
                parameters: { query: 'select * from secrets' },
              },
            },
          ],
        },
      };
    },
  };
  const { conversations, service, executed } = createHarness({ provider });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.deepEqual(result, { accepted: false, code: 'MALFORMED_TOOL_CALL' });
  assert.equal(executed.length, 0);
});

void test('[DDA-060][IAM-019] tenant mismatch is rejected by server authority', async () => {
  const mismatchedContext = {
    ...tenantContext,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: '00000000-0000-0000-0000-000000000099',
      workspaceId: '00000000-0000-0000-0000-000000000098',
    },
  } as never;
  const { conversations, service } = createHarness();
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn({
    ...turnInput(conversationId),
    context: mismatchedContext,
  } as never);

  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
});

void test('[DDA-060][IAM-024] explicitly composed read tool receives server descriptor, context, and usage', async () => {
  const provider: AgentProviderPortV1 = {
    async completeTurn() {
      return {
        accepted: true as const,
        value: {
          narrative: 'Doanh thu la 42.',
          toolCalls: [
            {
              toolCallId: 'tc-read',
              name: 'analysis.execute',
              input: { planId: datasetVersionId, datasetId, datasetVersionId },
            },
          ],
        },
      };
    },
  };
  const { conversations, service, usageCalls, executed } = createHarness({ provider });
  const conversationId = await seedConversation(conversations);
  const result = await service.runTurn(turnInput(conversationId) as never);

  assert.equal(result.accepted, true);
  assert.equal(
    usageCalls.some((call) => call.descriptor?.name === 'analysis.execute'),
    true,
  );
  assert.deepEqual(executed, [{ name: 'analysis.execute', context: tenantContext }]);
  if (result.accepted) {
    assert.deepEqual(result.value.toolResults[0]?.result, {
      cells: [{ cellId: 'c1', numericValue: 42 }],
      evidenceRefs: ['e1'],
    });
  }
});

void test('[DDA-044][DDA-060] OpenAI adapter rejects secret-shaped or unbounded context before transport', async () => {
  let transportCalled = false;
  const adapter = new OpenAiAgentProviderAdapter({
    enabled: true,
    complete: async () => {
      transportCalled = true;
      return {
        accepted: true as const,
        value: { narrative: 'unsafe', toolCalls: [] },
      };
    },
  });
  const result = await adapter.completeTurn({
    contextPackage: {
      systemPolicy: 'untrusted',
      workspacePolicyProjection: { accessPreset: 'EDITOR', deniedDatasetIds: [] },
      datasetBindings: [],
      recentMessages: Array.from({ length: 13 }, (_, index) => ({
        messageId: `m-${index}`,
        role: 'USER' as const,
        text: 'bounded',
      })),
      summaryText: '',
      evidenceRefs: [],
      locale: 'en',
      estimatedProviderTokenCeiling: 24_000,
      agentLevel: 'ANALYZE',
      apiKey: 'secret',
    } as never,
    userText: 'hello',
    correlationId: 'correlation-1',
  });

  assert.deepEqual(result, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal(transportCalled, false);
});
