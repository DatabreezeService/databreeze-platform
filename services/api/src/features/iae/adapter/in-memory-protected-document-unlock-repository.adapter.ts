import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { ProtectedDocumentUnlockRequestV1 } from '@databreeze/domain/protected-document/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ProtectedDocumentUnlockRepositoryPortV1,
  ProtectedDocumentUnlockTransactionPortV1,
} from '../application/protected-document-unlock-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(request: ProtectedDocumentUnlockRequestV1): ProtectedDocumentUnlockRequestV1 {
  return Object.freeze({
    ...request,
    tenantScope: Object.freeze({ ...request.tenantScope }),
  });
}

export class InMemoryProtectedDocumentUnlockRepositoryAdapter
  implements ProtectedDocumentUnlockRepositoryPortV1
{
  private requests = new Map<string, ProtectedDocumentUnlockRequestV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, request.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.requests.get(request.requestId);
    if (existing && JSON.stringify(existing) === JSON.stringify(request)) return;
    if (existing) {
      if (request.revision !== existing.revision + 1) throw new Error('IAE_REVISION_CONFLICT');
      if (
        existing.artifactVersionId !== request.artifactVersionId ||
        existing.createdAt !== request.createdAt ||
        JSON.stringify(existing.tenantScope) !== JSON.stringify(request.tenantScope)
      )
        throw new Error('IAE_IMMUTABLE_UNLOCK_REQUEST');
    }
    this.requests.set(request.requestId, clone(request));
  }

  public async find(
    context: IamTenantContextV1,
    requestId: ProtectedDocumentUnlockRequestV1['requestId'],
  ): Promise<ProtectedDocumentUnlockRequestV1 | undefined> {
    await Promise.resolve();
    const request = this.requests.get(requestId);
    return request && visible(context.tenantScope, request.tenantScope)
      ? clone(request)
      : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ProtectedDocumentUnlockTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.requests);
    try {
      return await work({ save: this.save.bind(this), find: this.find.bind(this) });
    } catch (error) {
      this.requests = before;
      throw error;
    } finally {
      release();
    }
  }
}
