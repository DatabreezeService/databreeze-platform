import { createHash, randomUUID } from 'node:crypto';

import type { AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { AgentContextBuilderService } from './agent-context-builder.service.js';
import type { AgentProviderPortV1 } from './agent-provider.port.js';
import type { AgentToolRegistryV1 } from './agent-tool-registry.js';
import type {
  AgentResultV1,
  AgentToolNameV1,
  AgentTurnProblemCodeV1,
} from './agent-tool.types.js';
import type { ConversationRepositoryPortV1 } from '../../conversation/application/conversation-repository.port.js';
import type { ConversationService } from '../../conversation/application/conversation.service.js';

const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_REPEATED_IDENTICAL_CALLS = 2;

export type AgentAuthorizationDecisionV1 =
  | { readonly allowed: true; readonly agentLevel: AgentGrantLevelV1 }
  | { readonly allowed: false; readonly code: AgentTurnProblemCodeV1 };

export type AgentUsageAdmissionV1 =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: 'BUDGET_DENIED' };

export type AgentToolExecutionResultV1 =
  | { readonly accepted: true; readonly value: unknown }
  | { readonly accepted: false; readonly code: AgentTurnProblemCodeV1 };

export interface AgentTurnDependenciesV1 {
  readonly conversations: ConversationService;
  readonly conversationRepository: ConversationRepositoryPortV1;
  readonly registry: AgentToolRegistryV1;
  readonly contextBuilder: AgentContextBuilderService;
  readonly provider: AgentProviderPortV1;
  readonly resolveAuthorization: (input: {
    readonly toolName: AgentToolNameV1;
    readonly datasetIds: readonly string[];
  }) => Promise<AgentAuthorizationDecisionV1>;
  readonly admitUsage: () => Promise<AgentUsageAdmissionV1>;
  readonly executeTool: (input: {
    readonly name: AgentToolNameV1;
    readonly input: Readonly<Record<string, unknown>>;
  }) => Promise<AgentToolExecutionResultV1>;
}

function rejected(code: AgentTurnProblemCodeV1): AgentResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function canonicalInputHash(name: string, input: Readonly<Record<string, unknown>>): string {
  return createHash('sha256')
    .update(JSON.stringify({ name, input }))
    .digest('hex');
}

function extractDatasetIds(input: Readonly<Record<string, unknown>>): readonly string[] {
  const ids: string[] = [];
  if (typeof input['datasetId'] === 'string') ids.push(input['datasetId']);
  const datasetIds = input['datasetIds'];
  if (Array.isArray(datasetIds)) {
    for (const candidate of datasetIds) {
      if (typeof candidate === 'string') ids.push(candidate);
    }
  }
  return Object.freeze(ids);
}

function hasUnknownProperties(
  input: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(input).some((key) => !allowedSet.has(key));
}

/** DDA-060: bounded workspace-agent turn orchestration. */
export class AgentTurnService {
  public constructor(private readonly deps: AgentTurnDependenciesV1) {}

  public async runTurn(input: {
    readonly tenantScope: TenantScopeV1;
    readonly memberAuthorized: boolean;
    readonly conversationId: string;
    readonly messageId: string;
    readonly text: string;
    readonly idempotencyKey: string;
    readonly locale: string;
    readonly agentLevel: AgentGrantLevelV1;
    readonly contextRevision?: number;
    readonly expectedContextRevision?: number;
  }): Promise<
    AgentResultV1<{
      readonly narrative: string;
      readonly toolResults: readonly {
        readonly toolCallId: string;
        readonly name: string;
        readonly result: unknown;
      }[];
    }>
  > {
    if (!input.memberAuthorized) return rejected('UNAUTHORIZED');

    const usage = await this.deps.admitUsage();
    if (!usage.allowed) return rejected(usage.code);

    const appended = await this.deps.conversations.appendUserMessage(
      { tenantScope: input.tenantScope, memberAuthorized: true },
      input.conversationId,
      {
        messageId: input.messageId,
        text: input.text,
        idempotencyKey: input.idempotencyKey,
      },
    );
    if (!appended.accepted) {
      return rejected(
        appended.code === 'DDA_CONVERSATION_NOT_FOUND' ? 'CONVERSATION_NOT_FOUND' : 'UNAUTHORIZED',
      );
    }

    const conversation = await this.deps.conversationRepository.findById(
      input.tenantScope,
      input.conversationId,
    );
    if (!conversation) return rejected('CONVERSATION_NOT_FOUND');

    const recent = await this.deps.conversationRepository.listMessages(
      input.tenantScope,
      input.conversationId,
      undefined,
      12,
    );
    const summary = await this.deps.conversationRepository.findSummary(
      input.tenantScope,
      input.conversationId,
    );

    const context = this.deps.contextBuilder.build({
      tenantScope: input.tenantScope,
      locale: input.locale,
      agentLevel: input.agentLevel,
      workspacePolicyProjection: {
        accessPreset: 'UNKNOWN',
        deniedDatasetIds: [],
      },
      datasetBindings: conversation.activeDatasetIds.map((datasetId) =>
        Object.freeze({
          datasetId,
          datasetVersionId: conversation.activeDatasetVersionIds[datasetId] ?? '',
          label: datasetId,
          schemaFingerprint: '',
        }),
      ),
      recentMessages: recent.map((message) =>
        Object.freeze({
          messageId: message.messageId,
          role: message.role,
          text: message.text,
        }),
      ),
      summaryText: summary?.text ?? '',
      evidenceRefs: [],
      ...(conversation.dashboardId === undefined
        ? {}
        : { dashboardContext: { dashboardId: conversation.dashboardId } }),
      ...(conversation.filterContext === undefined
        ? {}
        : { filterContext: conversation.filterContext }),
      ...(input.contextRevision === undefined ? {} : { contextRevision: input.contextRevision }),
      ...(input.expectedContextRevision === undefined
        ? {}
        : { expectedContextRevision: input.expectedContextRevision }),
    });
    if (!context.accepted) return rejected(context.code);

    const completion = await this.deps.provider.completeTurn({
      contextPackage: context.value,
      userText: input.text,
      correlationId: input.idempotencyKey,
    });
    if (!completion.accepted) {
      await this.appendSystemEvent(
        input.tenantScope,
        input.conversationId,
        `AGENT_TURN_FAILED:${completion.code}`,
      );
      return rejected(completion.code);
    }

    if (completion.value.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
      await this.appendSystemEvent(
        input.tenantScope,
        input.conversationId,
        'AGENT_TURN_FAILED:TOOL_LOOP_LIMIT',
      );
      return rejected('TOOL_LOOP_LIMIT');
    }

    const repeatCounts = new Map<string, number>();
    const toolResults: {
      readonly toolCallId: string;
      readonly name: string;
      readonly result: unknown;
    }[] = [];

    for (const call of completion.value.toolCalls) {
      if (
        typeof call.toolCallId !== 'string' ||
        typeof call.name !== 'string' ||
        call.input === null ||
        typeof call.input !== 'object' ||
        Array.isArray(call.input)
      ) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          'AGENT_TURN_FAILED:MALFORMED_TOOL_CALL',
        );
        return rejected('MALFORMED_TOOL_CALL');
      }

      const resolved = this.deps.registry.resolve(call.name);
      if (!resolved.accepted) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          'AGENT_TURN_FAILED:UNKNOWN_TOOL',
        );
        return rejected('UNKNOWN_TOOL');
      }

      const hash = canonicalInputHash(call.name, call.input);
      const nextCount = (repeatCounts.get(hash) ?? 0) + 1;
      repeatCounts.set(hash, nextCount);
      if (nextCount > MAX_REPEATED_IDENTICAL_CALLS) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          'AGENT_TURN_FAILED:REPEATED_TOOL_CALL',
        );
        return rejected('REPEATED_TOOL_CALL');
      }

      const auth = await this.deps.resolveAuthorization({
        toolName: resolved.value.name,
        datasetIds: extractDatasetIds(call.input),
      });
      if (!auth.allowed) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          `AGENT_TURN_FAILED:${auth.code}`,
        );
        return rejected(auth.code);
      }

      if (
        resolved.value.requiresUserConfirmation &&
        call.input['userConfirmation'] !== true
      ) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          'AGENT_TURN_FAILED:UNCONFIRMED_DASHBOARD_APPLY',
        );
        return rejected('UNCONFIRMED_DASHBOARD_APPLY');
      }

      if (
        resolved.value.name === 'dashboard.applyConfirmed' &&
        (typeof call.input['previewCommandId'] !== 'string' ||
          typeof call.input['expectedVersion'] !== 'number' ||
          typeof call.input['revision'] !== 'number' ||
          typeof call.input['idempotencyKey'] !== 'string' ||
          hasUnknownProperties(call.input, [
            'previewCommandId',
            'userConfirmation',
            'expectedVersion',
            'revision',
            'idempotencyKey',
          ]))
      ) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          'AGENT_TURN_FAILED:UNCONFIRMED_DASHBOARD_APPLY',
        );
        return rejected('UNCONFIRMED_DASHBOARD_APPLY');
      }

      const executed = await this.deps.executeTool({
        name: resolved.value.name,
        input: call.input,
      });
      if (!executed.accepted) {
        await this.appendSystemEvent(
          input.tenantScope,
          input.conversationId,
          `AGENT_TURN_FAILED:${executed.code}`,
        );
        return rejected(executed.code);
      }

      const envelope = Object.freeze({
        toolCallId: call.toolCallId,
        name: resolved.value.name,
        input: call.input,
        result: executed.value,
      });
      await this.deps.conversationRepository.appendMessage({
        messageId: randomUUID(),
        conversationId: input.conversationId,
        tenantScope: input.tenantScope,
        role: 'SYSTEM',
        text: JSON.stringify(envelope),
        sequence: 0,
        idempotencyKey: `${input.idempotencyKey}:tool:${call.toolCallId}`,
        createdAt: new Date().toISOString(),
      });
      toolResults.push(
        Object.freeze({
          toolCallId: call.toolCallId,
          name: resolved.value.name,
          result: executed.value,
        }),
      );
    }

    const narrative = completion.value.narrative.slice(0, 8_000);
    await this.deps.conversationRepository.appendMessage({
      messageId: randomUUID(),
      conversationId: input.conversationId,
      tenantScope: input.tenantScope,
      role: 'AGENT',
      text: narrative,
      sequence: 0,
      idempotencyKey: `${input.idempotencyKey}:assistant`,
      createdAt: new Date().toISOString(),
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        narrative,
        toolResults: Object.freeze(toolResults),
      }),
    });
  }

  public async executeDeterministicTool(input: {
    readonly tenantScope: TenantScopeV1;
    readonly memberAuthorized: boolean;
    readonly conversationId: string;
    readonly toolName: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly agentLevel: AgentGrantLevelV1;
  }): Promise<AgentResultV1<unknown>> {
    void input.agentLevel;
    if (!input.memberAuthorized) return rejected('UNAUTHORIZED');
    const resolved = this.deps.registry.resolve(input.toolName);
    if (!resolved.accepted) return rejected('UNKNOWN_TOOL');
    const auth = await this.deps.resolveAuthorization({
      toolName: resolved.value.name,
      datasetIds: extractDatasetIds(input.input),
    });
    if (!auth.allowed) return rejected(auth.code);
    return this.deps.executeTool({
      name: resolved.value.name,
      input: input.input,
    });
  }

  private async appendSystemEvent(
    tenantScope: TenantScopeV1,
    conversationId: string,
    text: string,
  ): Promise<void> {
    await this.deps.conversationRepository.appendMessage({
      messageId: randomUUID(),
      conversationId,
      tenantScope,
      role: 'SYSTEM',
      text,
      sequence: 0,
      idempotencyKey: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }
}
