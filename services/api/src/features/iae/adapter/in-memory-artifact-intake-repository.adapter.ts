import {
  tenantScopeContainsV1,
  updateInboxMetadataV1,
  type InboxItemV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactIntakeRepositoryPortV1,
  ArtifactIntakeTransactionPortV1,
} from '../application/artifact-intake-repository.port.js';

function clone(item: InboxItemV1): InboxItemV1 {
  return Object.freeze({
    ...item,
    tenantScope: Object.freeze({ ...item.tenantScope }),
  });
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function canMutate(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate);
}

/** IAE repository adapter for deterministic service and transaction tests. */
export class InMemoryArtifactIntakeRepositoryAdapter implements ArtifactIntakeRepositoryPortV1 {
  private items = new Map<string, InboxItemV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, item: InboxItemV1): Promise<void> {
    await Promise.resolve();
    if (!canMutate(context, item.tenantScope)) throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.items.get(item.inboxItemId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      if (context.expectedRevision !== existing.revision) throw new Error('IAE_REVISION_CONFLICT');
      if (
        existing.artifactVersionId !== item.artifactVersionId ||
        existing.idempotencyKey !== item.idempotencyKey ||
        JSON.stringify(existing.tenantScope) !== JSON.stringify(item.tenantScope) ||
        item.revision !== existing.revision + 1
      )
        throw new Error('IAE_IMMUTABLE_INBOX_ITEM');
      if (existing.state === item.state) {
        const metadataInput = {
          ...(Object.hasOwn(item, 'assigneeId') || Object.hasOwn(existing, 'assigneeId')
            ? { assigneeId: Object.hasOwn(item, 'assigneeId') ? item.assigneeId : null }
            : {}),
          ...(Object.hasOwn(item, 'labels') ? { labels: item.labels } : {}),
          ...(Object.hasOwn(item, 'priority') ? { priority: item.priority } : {}),
          ...(Object.hasOwn(item, 'dueAt') || Object.hasOwn(existing, 'dueAt')
            ? { dueAt: Object.hasOwn(item, 'dueAt') ? item.dueAt : null }
            : {}),
          expectedRevision: existing.revision,
        };
        const metadata = updateInboxMetadataV1(existing, metadataInput);
        if (!metadata.accepted || JSON.stringify(metadata.value) !== JSON.stringify(item))
          throw new Error('IAE_INVALID_INBOX_METADATA');
      }
    }
    const sameKey = [...this.items.values()].find(
      (candidate) =>
        candidate.idempotencyKey === item.idempotencyKey &&
        JSON.stringify(candidate.tenantScope) === JSON.stringify(item.tenantScope),
    );
    if (sameKey && sameKey.inboxItemId !== item.inboxItemId)
      throw new Error('IAE_IDEMPOTENCY_CONFLICT');
    this.items.set(item.inboxItemId, clone(item));
  }

  public async findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<InboxItemV1 | undefined> {
    await Promise.resolve();
    const item = [...this.items.values()].find(
      (candidate) =>
        candidate.idempotencyKey === idempotencyKey &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return item ? clone(item) : undefined;
  }

  public async find(
    context: IamTenantContextV1,
    inboxItemId: InboxItemV1['inboxItemId'],
  ): Promise<InboxItemV1 | undefined> {
    await Promise.resolve();
    const item = this.items.get(inboxItemId);
    return item && visible(context.tenantScope, item.tenantScope) ? clone(item) : undefined;
  }

  public async list(context: IamTenantContextV1): Promise<readonly InboxItemV1[]> {
    await Promise.resolve();
    return [...this.items.values()]
      .filter((item) => visible(context.tenantScope, item.tenantScope))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactIntakeTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.items);
    try {
      return await work({
        save: this.save.bind(this),
        findByIdempotency: this.findByIdempotency.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.items = before;
      throw error;
    } finally {
      release();
    }
  }
}
