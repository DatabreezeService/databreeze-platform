import {
  tenantScopeContainsV1,
  type JobDispatchRecordV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DispatchRepositoryPortV1,
  DispatchTransactionPortV1,
} from '../application/dispatch-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, record: JobDispatchRecordV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, record.tenantScope);
}

function clone(record: JobDispatchRecordV1): JobDispatchRecordV1 {
  return Object.freeze({ ...record, tenantScope: Object.freeze({ ...record.tenantScope }) });
}

/** In-memory dispatch outbox adapter; Redis is intentionally not represented here. */
export class InMemoryDispatchRepositoryAdapter implements DispatchRepositoryPortV1 {
  private records = new Map<string, JobDispatchRecordV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, record: JobDispatchRecordV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, record)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.records.get(record.dispatchId);
    if (existing && JSON.stringify(existing) === JSON.stringify(record)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_DISPATCH');
    const duplicate = [...this.records.values()].find(
      (candidate) =>
        candidate.jobId === record.jobId &&
        candidate.idempotencyKey === record.idempotencyKey &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    if (duplicate) throw new Error('JRA_DISPATCH_IDEMPOTENCY_CONFLICT');
    this.records.set(record.dispatchId, clone(record));
  }

  public async find(
    context: IamTenantContextV1,
    dispatchId: StableIdentifierV1,
  ): Promise<JobDispatchRecordV1 | undefined> {
    await Promise.resolve();
    const record = this.records.get(dispatchId);
    return record && visible(context.tenantScope, record.tenantScope) ? clone(record) : undefined;
  }

  public async findByIdempotency(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    idempotencyKey: string,
  ): Promise<JobDispatchRecordV1 | undefined> {
    await Promise.resolve();
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.jobId === jobId &&
        candidate.idempotencyKey === idempotencyKey &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return record ? clone(record) : undefined;
  }

  public async listPending(
    context: IamTenantContextV1,
    limit: number,
  ): Promise<readonly JobDispatchRecordV1[]> {
    await Promise.resolve();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
    return [...this.records.values()]
      .filter((record) => !record.deliveredAt && visible(context.tenantScope, record.tenantScope))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  public async update(
    context: IamTenantContextV1,
    record: JobDispatchRecordV1,
    expectedRevision: number,
  ): Promise<JobDispatchRecordV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, record)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.records.get(record.dispatchId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      existing.jobId !== record.jobId ||
      existing.eventType !== record.eventType ||
      existing.payloadHash !== record.payloadHash ||
      existing.idempotencyKey !== record.idempotencyKey ||
      JSON.stringify(existing.tenantScope) !== JSON.stringify(record.tenantScope)
    )
      throw new Error('JRA_IMMUTABLE_DISPATCH');
    this.records.set(record.dispatchId, clone(record));
    return clone(record);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DispatchTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.records);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        findByIdempotency: this.findByIdempotency.bind(this),
        listPending: this.listPending.bind(this),
        update: this.update.bind(this),
      });
    } catch (error) {
      this.records = before;
      throw error;
    } finally {
      release();
    }
  }
}
