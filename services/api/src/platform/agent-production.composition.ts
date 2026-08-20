import { createHash } from 'node:crypto';

import { parseStableIdentifierV1, tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { AuditLedgerService } from '../features/aud/application/audit-ledger.service.js';
import {
  OpenAiAgentProviderAdapter,
  loadOpenAiAgentConfig,
  type OpenAiAgentEnv,
} from '../features/dda/agent/adapter/openai-agent-provider.adapter.js';
import type { AgentProviderPortV1 } from '../features/dda/agent/application/agent-provider.port.js';
import { DisabledAgentProviderAdapter } from '../features/dda/agent/application/agent-provider.port.js';
import type { DdaAudComposePortV1 } from '../features/dda/application/foundation-ports.js';
import type {
  ConversationContextVersionAuthorityDecisionV1,
  ConversationContextVersionAuthorityPortV1,
} from '../features/dda/conversation/api/conversation.controller.js';
import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../features/iam/application/tenant-context.js';
import type { DatasetVersionRepositoryPortV1 } from '../features/dsm/application/dataset-version-repository.port.js';
import type {
  GovernedDatasetAuthorizationPortV1,
  GovernedDatasetAuthorizationResultV1,
} from '../features/dsm/application/governed-dataset-authorization.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../features/dsm/application/governed-dataset-repository.port.js';

const OPENAI_SERVER_SECRET_PATTERN = /^sk-[a-z0-9_-]{8,}$/iu;
const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-0000000000a0';

/**
 * Production-only provider gate. The owner flag, validated settings, and server-held key all
 * come from the process environment; no request or client value can enable this path.
 */
export function createProductionAgentProvider(
  environment: OpenAiAgentEnv = process.env,
): AgentProviderPortV1 {
  const config = loadOpenAiAgentConfig(environment);
  if (
    !config.enabled ||
    !config.configurationValid ||
    !config.apiKeyPresent ||
    config.apiKey === undefined ||
    !OPENAI_SERVER_SECRET_PATTERN.test(config.apiKey)
  ) {
    return new DisabledAgentProviderAdapter();
  }
  return new OpenAiAgentProviderAdapter({ config });
}

function deterministicAuditId(seed: string): string {
  const hash = createHash('sha256').update(seed, 'utf8').digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function auditContext(
  tenantScope: IamTenantContextV1['tenantScope'],
  correlationId: string,
  idempotencySuffix: string,
) {
  const parsedCorrelationId = parseStableIdentifierV1(correlationId);
  if (!parsedCorrelationId.accepted) throw new Error('DDA_AGENT_AUDIT_CONTEXT_INVALID');
  const created = createIamTenantContextV1({
    tenantScope,
    actorId: SYSTEM_ACTOR_ID,
    correlationId: parsedCorrelationId.value,
    idempotencyKey: `dda-agent-audit-${correlationId}-${idempotencySuffix}`,
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  });
  if (!created.accepted) throw new Error('DDA_AGENT_AUDIT_CONTEXT_INVALID');
  return created.value;
}

/** Maps agent audit outcomes to the canonical AUD action vocabulary without persisting prompts. */
export function composeAgentAuditPortFromLedger(ledger: AuditLedgerService): DdaAudComposePortV1 {
  return {
    async emitContentSafeSummary(input) {
      const eventAction = input.outcome === 'ATTEMPTED' ? 'job.started' : 'job.completed';
      const eventId = deterministicAuditId(
        JSON.stringify({
          tenantScope: input.tenantScope,
          correlationId: input.correlationId,
          action: input.action,
          outcome: input.outcome,
        }),
      );
      const parsedEntityId = parseStableIdentifierV1(input.references[0] ?? input.correlationId);
      const entityId = parsedEntityId.accepted ? parsedEntityId.value : eventId;
      const context = auditContext(
        input.tenantScope,
        input.correlationId,
        `${input.action}-${input.outcome}`,
      );
      const result = await ledger.append(context, {
        eventId,
        actorType: 'SYSTEM',
        action: eventAction,
        entityType: 'agent_tool',
        entityId,
        entityRevision: 1,
        occurredAt: new Date().toISOString(),
        summary: Object.freeze({ outcome: input.outcome, status: input.action }),
      });
      if (!result.accepted) throw new Error('DDA_AGENT_AUDIT_UNAVAILABLE');
    },
  };
}

function mapAuthorizationDecision(
  decision: GovernedDatasetAuthorizationResultV1,
): ConversationContextVersionAuthorityDecisionV1 | undefined {
  if (decision.accepted) return undefined;
  switch (decision.code) {
    case 'AUTHORIZATION_UNAVAILABLE':
      return { allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    case 'DATASET_RESTRICTED':
      return { allowed: false, code: 'DATASET_RESTRICTED' };
    case 'INVALID_SCOPE':
    case 'SCOPE_DENIED':
      return { allowed: false, code: 'INVALID_SCOPE' };
    case 'NOT_FOUND':
      return { allowed: false, code: 'NOT_FOUND' };
    default:
      return { allowed: false, code: 'FORBIDDEN' };
  }
}

/**
 * Conversation context may use a dataset version only after DSM has authorized the current
 * principal and the tenant-scoped version repository has returned the exact dataset/version
 * pair. The adapter deliberately has no access to IAM or DSM persistence internals.
 */
export class DsmConversationContextVersionAuthorityAdapter
  implements ConversationContextVersionAuthorityPortV1
{
  public constructor(
    private readonly authorization: GovernedDatasetAuthorizationPortV1,
    private readonly versions: DatasetVersionRepositoryPortV1,
  ) {}

  public async authorizeDatasetVersion(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<ConversationContextVersionAuthorityDecisionV1> {
    const datasetId = parseStableIdentifierV1(input.datasetId);
    const datasetVersionId = parseStableIdentifierV1(input.datasetVersionId);
    if (!datasetId.accepted || !datasetVersionId.accepted) {
      return { allowed: false, code: 'INVALID_SCOPE' };
    }
    let decision: GovernedDatasetAuthorizationResultV1;
    try {
      decision = await this.authorization.authorize(input.context, {
        action: 'READ_VERSION',
        datasetId: datasetId.value,
        versionId: datasetVersionId.value,
      });
    } catch {
      return { allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    }
    const authorizationFailure = mapAuthorizationDecision(decision);
    if (authorizationFailure !== undefined) return authorizationFailure;

    let version;
    try {
      version = await this.versions.find(input.context, datasetVersionId.value);
    } catch {
      return { allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    }
    if (version === undefined) return { allowed: false, code: 'NOT_FOUND' };
    if (version.datasetId !== datasetId.value) {
      return { allowed: false, code: 'VERSION_DATASET_MISMATCH' };
    }
    if (
      !tenantScopeContainsV1(input.context.tenantScope, version.tenantScope) &&
      !tenantScopeContainsV1(version.tenantScope, input.context.tenantScope)
    ) {
      return { allowed: false, code: 'INVALID_SCOPE' };
    }
    return { allowed: true };
  }
}

/**
 * The public analysis picker is backed by DSM governed definitions: each
 * published definition's immutable `versionId` is the version sent by the
 * client. Keep the conversation re-check on that same authority instead of
 * silently switching to the separate materialized-manifest repository.
 */
export class GovernedDatasetConversationContextVersionAuthorityAdapter
  implements ConversationContextVersionAuthorityPortV1
{
  public constructor(
    private readonly authorization: GovernedDatasetAuthorizationPortV1,
    private readonly definitions: GovernedDatasetRepositoryPortV1,
  ) {}

  public async authorizeDatasetVersion(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<ConversationContextVersionAuthorityDecisionV1> {
    const datasetId = parseStableIdentifierV1(input.datasetId);
    const datasetVersionId = parseStableIdentifierV1(input.datasetVersionId);
    if (!datasetId.accepted || !datasetVersionId.accepted) {
      return { allowed: false, code: 'INVALID_SCOPE' };
    }

    let decision: GovernedDatasetAuthorizationResultV1;
    try {
      decision = await this.authorization.authorize(input.context, {
        action: 'READ_VERSION',
        datasetId: datasetId.value,
        versionId: datasetVersionId.value,
      });
    } catch {
      return { allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    }
    const authorizationFailure = mapAuthorizationDecision(decision);
    if (authorizationFailure !== undefined) return authorizationFailure;

    let definition;
    try {
      definition = await this.definitions.find(input.context, datasetVersionId.value);
    } catch {
      return { allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    }
    if (definition === undefined) return { allowed: false, code: 'NOT_FOUND' };
    if (definition.datasetId !== datasetId.value || definition.status !== 'PUBLISHED') {
      return { allowed: false, code: 'VERSION_DATASET_MISMATCH' };
    }
    if (
      !tenantScopeContainsV1(input.context.tenantScope, definition.tenantScope) &&
      !tenantScopeContainsV1(definition.tenantScope, input.context.tenantScope)
    ) {
      return { allowed: false, code: 'INVALID_SCOPE' };
    }
    return { allowed: true };
  }
}
