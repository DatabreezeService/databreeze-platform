import { randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ConversationContextEventRecordV1,
  ConversationRecordV1,
  ConversationRepositoryPortV1,
} from './conversation-repository.port.js';

export type ConversationContextResultV1 =
  | {
      readonly accepted: true;
      readonly conversation: ConversationRecordV1;
      readonly event?: ConversationContextEventRecordV1;
    }
  | {
      readonly accepted: false;
      readonly code: 'CONTEXT_REVIEW_REQUIRED' | 'DDA_CONVERSATION_NOT_FOUND';
    };

/** DDA-056: restore recorded context and emit version-advance events. */
export class ConversationContextService {
  public constructor(private readonly repository: ConversationRepositoryPortV1) {}

  public async resolveTurnContext(input: {
    readonly tenantScope: TenantScopeV1;
    readonly conversationId: string;
    readonly latestCompatibleVersions: Readonly<Record<string, string>>;
    readonly incompatibleDatasetIds?: readonly string[];
  }): Promise<ConversationContextResultV1> {
    const conversation = await this.repository.findById(
      input.tenantScope,
      input.conversationId,
    );
    if (!conversation) {
      return Object.freeze({ accepted: false, code: 'DDA_CONVERSATION_NOT_FOUND' });
    }

    if ((input.incompatibleDatasetIds ?? []).length > 0) {
      return Object.freeze({ accepted: false, code: 'CONTEXT_REVIEW_REQUIRED' });
    }

    let updated = conversation;
    let event: ConversationContextEventRecordV1 | undefined;
    for (const datasetId of conversation.activeDatasetIds) {
      const current = conversation.activeDatasetVersionIds[datasetId];
      const latest = input.latestCompatibleVersions[datasetId];
      if (!current || !latest || current === latest) continue;
      event = Object.freeze({
        eventId: randomUUID(),
        conversationId: conversation.conversationId,
        tenantScope: input.tenantScope,
        kind: 'DATASET_VERSION_ADVANCED' as const,
        beforeVersionId: current,
        afterVersionId: latest,
        occurredAt: new Date().toISOString(),
      });
      await this.repository.appendContextEvent(event);
      updated = Object.freeze({
        ...updated,
        activeDatasetVersionIds: Object.freeze({
          ...updated.activeDatasetVersionIds,
          [datasetId]: latest,
        }),
        updatedAt: new Date().toISOString(),
      });
      await this.repository.update(updated);
      break;
    }

    return Object.freeze({
      accepted: true,
      conversation: updated,
      ...(event === undefined ? {} : { event }),
    });
  }
}
