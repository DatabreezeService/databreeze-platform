import { randomUUID } from 'node:crypto';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

import type { AgentContextBuilderService } from './agent-context-builder.service.js';
import type { AgentProviderPortV1 } from './agent-provider.port.js';
import type { AgentToolRegistryV1 } from './agent-tool-registry.js';
import {
  FailClosedAgentIamActionAuthorizationAdapter,
  type AgentIamActionAuthorizationPortV1,
} from './agent-runtime.port.js';
import { canonicalAgentInputFingerprintV1 } from './agent-consequential-command.port.js';
import type {
  AgentAuthorityPortV1,
  AgentToolExecutorPortV1,
  AgentUsagePortV1,
} from './agent-runtime.port.js';
import type {
  AgentResultV1,
  AgentToolDescriptorV1,
  AgentTurnProblemCodeV1,
} from './agent-tool.types.js';
import type { ConversationRepositoryPortV1 } from '../../conversation/application/conversation-repository.port.js';
import type { ConversationService } from '../../conversation/application/conversation.service.js';

const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_REPEATED_IDENTICAL_CALLS = 2;
const MAX_USER_TEXT_LENGTH = 8_000;
const MAX_NARRATIVE_LENGTH = 8_000;
const FORBIDDEN_TOOL_INPUT_KEYS = new Set([
  'authorized',
  'command',
  'databaseClient',
  'generatedCode',
  'generatedSql',
  'localPath',
  'numericValues',
  'rawQuery',
  'resultCells',
  'sql',
  'storageCredential',
  'tenantScope',
  'query',
]);

export interface AgentTurnDependenciesV1 {
  readonly conversations: ConversationService;
  readonly conversationRepository: ConversationRepositoryPortV1;
  readonly registry: AgentToolRegistryV1;
  readonly contextBuilder: AgentContextBuilderService;
  readonly provider: AgentProviderPortV1;
  readonly authority: AgentAuthorityPortV1;
  readonly usage: AgentUsagePortV1;
  readonly executor: AgentToolExecutorPortV1;
  readonly iamActionAuthorization?: AgentIamActionAuthorizationPortV1;
}

function rejected(code: AgentTurnProblemCodeV1): AgentResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function canonicalInputHash(name: string, input: Readonly<Record<string, unknown>>): string {
  return `${name}:${canonicalAgentInputFingerprintV1(input)}`;
}

function extractDatasetIds(input: Readonly<Record<string, unknown>>): readonly string[] {
  const ids: string[] = [];
  if (validResourceIdentifier(input['datasetId'])) ids.push(input['datasetId']);
  const datasetIds = input['datasetIds'];
  if (Array.isArray(datasetIds)) {
    for (const candidate of datasetIds) {
      if (validResourceIdentifier(candidate)) ids.push(candidate);
    }
  }
  return Object.freeze(ids);
}

function extractResourceIds(input: Readonly<Record<string, unknown>>): readonly string[] {
  const ids: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'idempotencyKey' || key === 'parameters') continue;
    if (key.endsWith('Id') && validResourceIdentifier(value)) ids.push(value);
    if (key.endsWith('Ids') && Array.isArray(value)) {
      for (const candidate of value) {
        if (validResourceIdentifier(candidate)) ids.push(candidate);
      }
    }
  }
  return Object.freeze([...new Set(ids)]);
}

function hasOnlySchemaProperties(
  input: Readonly<Record<string, unknown>>,
  descriptor: AgentToolDescriptorV1,
): boolean {
  const allowed = new Set(descriptor.inputSchema.properties);
  return Object.keys(input).every((key) => allowed.has(key));
}

function hasRequiredSchemaProperties(
  input: Readonly<Record<string, unknown>>,
  descriptor: AgentToolDescriptorV1,
): boolean {
  return descriptor.inputSchema.requiredProperties.every((key) =>
    Object.prototype.hasOwnProperty.call(input, key),
  );
}

function validBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function validResourceIdentifier(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function hasForbiddenToolInputKey(value: unknown, depth = 0): boolean {
  if (depth > 4 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenToolInputKey(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) =>
      FORBIDDEN_TOOL_INPUT_KEYS.has(key) || hasForbiddenToolInputKey(child, depth + 1),
  );
}

function validateToolInput(
  descriptor: AgentToolDescriptorV1,
  input: Readonly<Record<string, unknown>>,
): AgentTurnProblemCodeV1 | undefined {
  if (
    descriptor.name === 'evidence.resolve' &&
    Object.prototype.hasOwnProperty.call(input, 'authorized')
  ) {
    return 'EVIDENCE_UNAUTHORIZED';
  }
  if (hasForbiddenToolInputKey(input)) return 'MALFORMED_TOOL_CALL';
  if (!hasOnlySchemaProperties(input, descriptor)) {
    return 'MALFORMED_TOOL_CALL';
  }
  if (!hasRequiredSchemaProperties(input, descriptor)) {
    return descriptor.requiresUserConfirmation
      ? 'UNCONFIRMED_DASHBOARD_APPLY'
      : 'MALFORMED_TOOL_CALL';
  }

  for (const key of descriptor.inputSchema.properties) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (key === 'limit') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return 'MALFORMED_TOOL_CALL';
      }
      continue;
    }
    if (key === 'expectedVersion' || key === 'revision') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        return descriptor.requiresUserConfirmation
          ? 'UNCONFIRMED_DASHBOARD_APPLY'
          : 'MALFORMED_TOOL_CALL';
      }
      continue;
    }
    if (key === 'idempotencyKey') {
      if (!validBoundedString(value)) return 'UNCONFIRMED_DASHBOARD_APPLY';
      continue;
    }
    if (key === 'userConfirmation') {
      if (value !== true) return 'UNCONFIRMED_DASHBOARD_APPLY';
      continue;
    }
    if (key === 'columns') {
      if (!Array.isArray(value) || value.some((item) => !validBoundedString(item))) {
        return 'MALFORMED_TOOL_CALL';
      }
      continue;
    }
    if (key === 'parameters') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'MALFORMED_TOOL_CALL';
      }
      continue;
    }
    if (key === 'question' || key === 'correction') {
      if (!validBoundedString(value) || value.length > 4_000) {
        return 'MALFORMED_TOOL_CALL';
      }
      continue;
    }
    if (key === 'datasetId' || key.endsWith('Id')) {
      if (!validResourceIdentifier(value)) return 'MALFORMED_TOOL_CALL';
    }
  }

  if (descriptor.name === 'dataset.sample') {
    const limit = input['limit'];
    if (typeof limit === 'number' && limit > descriptor.maximumRows) {
      return 'OVER_BOUND_SAMPLE';
    }
  }
  return undefined;
}

/** DDA-060: bounded workspace-agent turn orchestration with server-owned authority. */
export class AgentTurnService {
  private readonly iamActionAuthorization: AgentIamActionAuthorizationPortV1;

  public constructor(private readonly deps: AgentTurnDependenciesV1) {
    this.iamActionAuthorization =
      deps.iamActionAuthorization ?? new FailClosedAgentIamActionAuthorizationAdapter();
  }

  public async runTurn(input: {
    readonly context: IamTenantContextV1;
    readonly conversationId: string;
    readonly messageId: string;
    readonly text: string;
    readonly idempotencyKey: string;
    readonly locale: string;
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
    const memberAuthority = await this.deps.authority.authorize({
      context: input.context,
      datasetIds: [],
    });
    if (!memberAuthority.allowed) return rejected(memberAuthority.code);
    const member = memberAuthority;
    if (member.effectiveAgentLevel === 'NONE') return rejected('INSUFFICIENT_AGENT_LEVEL');

    const usage = await this.deps.usage.admit({
      context: input.context,
      costClass: 'MEDIUM',
      correlationId: input.idempotencyKey,
    });
    if (!usage.allowed) return rejected(usage.code);

    const appended = await this.deps.conversations.appendUserMessage(
      { tenantScope: input.context.tenantScope, memberAuthorized: true },
      input.conversationId,
      {
        messageId: input.messageId,
        text: input.text.slice(0, MAX_USER_TEXT_LENGTH),
        idempotencyKey: input.idempotencyKey,
      },
    );
    if (!appended.accepted) {
      return rejected(
        appended.code === 'DDA_CONVERSATION_NOT_FOUND' ? 'CONVERSATION_NOT_FOUND' : 'UNAUTHORIZED',
      );
    }

    const conversation = await this.deps.conversationRepository.findById(
      input.context.tenantScope,
      input.conversationId,
    );
    if (!conversation) return rejected('CONVERSATION_NOT_FOUND');

    const recent = await this.deps.conversationRepository.listMessages(
      input.context.tenantScope,
      input.conversationId,
      undefined,
      12,
    );
    const summary = await this.deps.conversationRepository.findSummary(
      input.context.tenantScope,
      input.conversationId,
    );

    const context = this.deps.contextBuilder.build({
      tenantScope: input.context.tenantScope,
      locale: input.locale,
      agentLevel: member.effectiveAgentLevel,
      workspacePolicyProjection: {
        accessPreset: member.accessPreset,
        deniedDatasetIds: member.deniedDatasetIds,
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
          text: message.text.slice(0, MAX_USER_TEXT_LENGTH),
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
      userText: input.text.slice(0, MAX_USER_TEXT_LENGTH),
      correlationId: input.idempotencyKey,
    });
    if (!completion.accepted) {
      await this.appendSystemEvent(
        input.context,
        input.conversationId,
        `AGENT_TURN_FAILED:${completion.code}`,
      );
      return rejected(completion.code);
    }
    if (
      typeof completion.value.narrative !== 'string' ||
      !Array.isArray(completion.value.toolCalls)
    ) {
      await this.appendSystemEvent(
        input.context,
        input.conversationId,
        'AGENT_TURN_FAILED:MALFORMED_TOOL_CALL',
      );
      return rejected('MALFORMED_TOOL_CALL');
    }

    if (completion.value.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
      await this.appendSystemEvent(
        input.context,
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

    const toolCalls = completion.value.toolCalls as readonly {
      readonly toolCallId: string;
      readonly name: string;
      readonly input: Readonly<Record<string, unknown>>;
    }[];
    for (const call of toolCalls) {
      if (
        typeof call.toolCallId !== 'string' ||
        typeof call.name !== 'string' ||
        call.input === null ||
        typeof call.input !== 'object' ||
        Array.isArray(call.input)
      ) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          'AGENT_TURN_FAILED:MALFORMED_TOOL_CALL',
        );
        return rejected('MALFORMED_TOOL_CALL');
      }

      const resolved = this.deps.registry.resolve(call.name);
      if (!resolved.accepted) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          'AGENT_TURN_FAILED:UNKNOWN_TOOL',
        );
        return rejected('UNKNOWN_TOOL');
      }
      const descriptor = resolved.value;
      const toolInput = call.input;
      const inputProblem = validateToolInput(descriptor, toolInput);
      if (inputProblem !== undefined) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          `AGENT_TURN_FAILED:${inputProblem}`,
        );
        return rejected(inputProblem);
      }

      const hash = canonicalInputHash(descriptor.name, toolInput);
      const nextCount = (repeatCounts.get(hash) ?? 0) + 1;
      repeatCounts.set(hash, nextCount);
      if (nextCount > MAX_REPEATED_IDENTICAL_CALLS) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          'AGENT_TURN_FAILED:REPEATED_TOOL_CALL',
        );
        return rejected('REPEATED_TOOL_CALL');
      }

      const authority = await this.deps.authority.authorize({
        context: input.context,
        descriptor,
        datasetIds: extractDatasetIds(toolInput),
        input: toolInput,
        // Provider output is untrusted and can never represent the authenticated
        // user's acceptance of a preview. Confirmed mutations are available only
        // through executeDeterministicTool, whose input comes from the explicit
        // user action HTTP path.
        confirmationPresent: false,
      });
      if (!authority.allowed) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          `AGENT_TURN_FAILED:${authority.code}`,
        );
        return rejected(authority.code);
      }

      const action = await this.authorizeIamAction(
        input.context,
        descriptor,
        extractResourceIds(toolInput),
      );
      if (!action.allowed) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          `AGENT_TURN_FAILED:${action.code}`,
        );
        return rejected(action.code);
      }

      const toolUsage = await this.deps.usage.admit({
        context: input.context,
        descriptor,
        costClass: descriptor.costClass,
        correlationId: `${input.idempotencyKey}:tool:${call.toolCallId}`,
      });
      if (!toolUsage.allowed) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          `AGENT_TURN_FAILED:${toolUsage.code}`,
        );
        return rejected(toolUsage.code);
      }

      const executed = await this.deps.executor.execute({
        context: input.context,
        descriptor,
        input: toolInput,
        authority,
        correlationId: `${input.idempotencyKey}:tool:${call.toolCallId}`,
      });
      if (!executed.accepted) {
        await this.appendSystemEvent(
          input.context,
          input.conversationId,
          `AGENT_TURN_FAILED:${executed.code}`,
        );
        return rejected(executed.code);
      }

      await this.deps.conversationRepository.appendMessage({
        messageId: randomUUID(),
        conversationId: input.conversationId,
        tenantScope: input.context.tenantScope,
        role: 'SYSTEM',
        text: this.safeToolResultEventText(descriptor, toolInput, executed.value),
        sequence: 0,
        idempotencyKey: `${input.idempotencyKey}:tool:${call.toolCallId}`,
        createdAt: new Date().toISOString(),
      });
      toolResults.push(
        Object.freeze({
          toolCallId: call.toolCallId,
          name: descriptor.name,
          result: executed.value,
        }),
      );
    }

    const narrative = completion.value.narrative.slice(0, MAX_NARRATIVE_LENGTH);
    await this.deps.conversationRepository.appendMessage({
      messageId: randomUUID(),
      conversationId: input.conversationId,
      tenantScope: input.context.tenantScope,
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
    readonly context: IamTenantContextV1;
    readonly conversationId: string;
    readonly toolName: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly idempotencyKey?: string;
  }): Promise<AgentResultV1<unknown>> {
    const resolved = this.deps.registry.resolve(input.toolName);
    if (!resolved.accepted) return rejected('UNKNOWN_TOOL');
    const descriptor = resolved.value;
    const inputProblem = validateToolInput(descriptor, input.input);
    if (inputProblem !== undefined) return rejected(inputProblem);

    const authority = await this.deps.authority.authorize({
      context: input.context,
      descriptor,
      datasetIds: extractDatasetIds(input.input),
      input: input.input,
      confirmationPresent:
        descriptor.requiresUserConfirmation && input.input['userConfirmation'] === true,
    });
    if (!authority.allowed) return rejected(authority.code);

    const action = await this.authorizeIamAction(
      input.context,
      descriptor,
      extractResourceIds(input.input),
    );
    if (!action.allowed) return rejected(action.code);

    const usage = await this.deps.usage.admit({
      context: input.context,
      descriptor,
      costClass: descriptor.costClass,
      correlationId: input.idempotencyKey ?? input.context.idempotencyKey,
    });
    if (!usage.allowed) return rejected(usage.code);

    return this.deps.executor.execute({
      context: input.context,
      descriptor,
      input: input.input,
      authority,
      correlationId: input.idempotencyKey ?? input.context.idempotencyKey,
    });
  }

  private async appendSystemEvent(
    context: IamTenantContextV1,
    conversationId: string,
    text: string,
  ): Promise<void> {
    await this.deps.conversationRepository.appendMessage({
      messageId: randomUUID(),
      conversationId,
      tenantScope: context.tenantScope,
      role: 'SYSTEM',
      text,
      sequence: 0,
      idempotencyKey: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  private async authorizeIamAction(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    resourceIds: readonly string[],
  ): Promise<
    { readonly allowed: true } | { readonly allowed: false; readonly code: 'UNAUTHORIZED' }
  > {
    try {
      return await this.iamActionAuthorization.authorize({ context, descriptor, resourceIds });
    } catch {
      return Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
    }
  }

  private safeToolResultEventText(
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
    result: unknown,
  ): string {
    const references = collectSafeReferenceIds(input, result);
    const resultId = references.find((reference) => reference.source === 'result');
    const referenceText = references.map((reference) => reference.id).join(',');
    return [
      'AGENT_TOOL_RESULT_V1',
      `tool=${descriptor.name}`,
      'status=SUCCEEDED',
      resultId === undefined ? undefined : `resultId=${resultId.id}`,
      referenceText === '' ? undefined : `references=${referenceText}`,
      'summary=bounded-reference-only',
    ]
      .filter((part): part is string => part !== undefined)
      .join(' ')
      .slice(0, 2_000);
  }
}

function collectSafeReferenceIds(
  input: Readonly<Record<string, unknown>>,
  result: unknown,
): readonly { readonly id: string; readonly source: 'input' | 'result' }[] {
  const references: { readonly id: string; readonly source: 'input' | 'result' }[] = [];
  const collect = (value: unknown, source: 'input' | 'result', depth = 0) => {
    if (depth > 6 || references.length >= 24 || typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      for (const child of value) collect(child, source, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        key !== 'idempotencyKey' &&
        key.toLowerCase().endsWith('id') &&
        validResourceIdentifier(child)
      ) {
        if (!references.some((reference) => reference.id === child)) {
          references.push({ id: child, source });
        }
      }
      collect(child, source, depth + 1);
      if (references.length >= 24) return;
    }
  };
  collect(input, 'input');
  collect(result, 'result');
  return Object.freeze(references);
}

export type {
  AgentAuthorityDecisionV1,
  AgentToolExecutionResultV1,
  AgentUsageAdmissionV1,
} from './agent-runtime.port.js';
