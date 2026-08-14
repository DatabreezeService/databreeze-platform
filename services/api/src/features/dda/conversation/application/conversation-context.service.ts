import { randomUUID } from 'node:crypto';

import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  ConversationContextAdvanceResultV1,
  ConversationContextEventRecordV1,
  ConversationRecordV1,
  ConversationRepositoryPortV1,
} from './conversation-repository.port.js';

export type ConversationContextVersionResolutionV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly datasetVersionId: string };
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'CONTEXT_REVIEW_REQUIRED'
        | 'AUTHORIZATION_UNAVAILABLE'
        | 'NOT_FOUND'
        | 'FORBIDDEN';
    };

/** Server-owned compatibility resolution. It never accepts a client version map. */
export interface ConversationContextVersionResolverPortV1 {
  resolveLatestCompatibleVersion(input: {
    readonly context?: IamTenantContextV1;
    readonly tenantScope: TenantScopeV1;
    readonly datasetId: string;
    readonly currentDatasetVersionId: string;
  }): Promise<ConversationContextVersionResolutionV1>;
}

export type ConversationContextResultV1 =
  | {
      readonly accepted: true;
      readonly conversation: ConversationRecordV1;
      readonly event?: ConversationContextEventRecordV1;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'CONTEXT_REVIEW_REQUIRED'
        | 'CONTEXT_AUTHORITY_UNAVAILABLE'
        | 'CONTEXT_IDEMPOTENCY_CONFLICT'
        | 'DDA_CONVERSATION_NOT_FOUND';
    };

function accepted(
  conversation: ConversationRecordV1,
  event?: ConversationContextEventRecordV1,
): ConversationContextResultV1 {
  return Object.freeze({
    accepted: true as const,
    conversation,
    ...(event === undefined ? {} : { event }),
  });
}

function rejected(
  code: Extract<ConversationContextResultV1, { readonly accepted: false }>['code'],
): ConversationContextResultV1 {
  return Object.freeze({ accepted: false as const, code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function advanceResult(
  value: ConversationContextAdvanceResultV1,
): ConversationContextResultV1 | undefined {
  if (value === 'IDEMPOTENCY_CONFLICT') return rejected('CONTEXT_IDEMPOTENCY_CONFLICT');
  if (value === 'CONTEXT_CAS_CONFLICT') return rejected('CONTEXT_REVIEW_REQUIRED');
  return accepted(value.conversation, value.event);
}

/** DDA-056: resolve context through server authority and atomically record transitions. */
export class ConversationContextService {
  public constructor(
    private readonly repository: ConversationRepositoryPortV1,
    private readonly resolver?: ConversationContextVersionResolverPortV1,
  ) {}

  public async resolveTurnContext(input: {
    readonly tenantScope: TenantScopeV1;
    readonly conversationId: string;
    readonly idempotencyKey: string;
    readonly authorizationContext?: IamTenantContextV1;
  }): Promise<ConversationContextResultV1> {
    const conversation = await this.repository.findById(input.tenantScope, input.conversationId);
    if (!conversation) return rejected('DDA_CONVERSATION_NOT_FOUND');

    if (this.resolver === undefined || this.repository.advanceContext === undefined) {
      return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
    }

    const changes: {
      readonly datasetId: string;
      readonly beforeVersionId: string;
      readonly afterVersionId: string;
    }[] = [];
    for (const datasetId of conversation.activeDatasetIds) {
      const currentVersionId = conversation.activeDatasetVersionIds[datasetId];
      if (currentVersionId === undefined) return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      let resolved: unknown;
      try {
        resolved = await this.resolver.resolveLatestCompatibleVersion({
          ...(input.authorizationContext === undefined
            ? {}
            : { context: input.authorizationContext }),
          tenantScope: input.tenantScope,
          datasetId,
          currentDatasetVersionId: currentVersionId,
        });
      } catch {
        return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      }
      if (!isRecord(resolved) || typeof resolved['accepted'] !== 'boolean') {
        return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      }
      if (resolved['accepted'] !== true) {
        return resolved['code'] === 'CONTEXT_REVIEW_REQUIRED'
          ? rejected('CONTEXT_REVIEW_REQUIRED')
          : rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      }
      if (
        !isRecord(resolved['value']) ||
        typeof resolved['value']['datasetVersionId'] !== 'string'
      ) {
        return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      }
      const parsedVersionId = parseStableIdentifierV1(resolved['value']['datasetVersionId']);
      if (!parsedVersionId.accepted) return rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
      if (parsedVersionId.value !== currentVersionId) {
        changes.push({
          datasetId,
          beforeVersionId: currentVersionId,
          afterVersionId: parsedVersionId.value,
        });
      }
    }

    const change = changes[0];
    if (change === undefined) {
      const replay = this.repository.findContextEventByIdempotency
        ? await this.repository.findContextEventByIdempotency(
            input.tenantScope,
            input.conversationId,
            input.idempotencyKey,
          )
        : undefined;
      return replay === undefined ? accepted(conversation) : accepted(conversation, replay);
    }
    const result = await this.repository.advanceContext({
      tenantScope: input.tenantScope,
      conversationId: input.conversationId,
      datasetId: change.datasetId,
      beforeVersionId: change.beforeVersionId,
      afterVersionId: change.afterVersionId,
      idempotencyKey: input.idempotencyKey,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    if (result === 'CONTEXT_CAS_CONFLICT' && this.repository.findContextEventByIdempotency) {
      const replay = await this.repository.findContextEventByIdempotency(
        input.tenantScope,
        input.conversationId,
        input.idempotencyKey,
      );
      if (replay !== undefined)
        return accepted(
          (await this.repository.findById(input.tenantScope, input.conversationId)) ?? conversation,
          replay,
        );
    }
    return advanceResult(result) ?? rejected('CONTEXT_AUTHORITY_UNAVAILABLE');
  }
}
