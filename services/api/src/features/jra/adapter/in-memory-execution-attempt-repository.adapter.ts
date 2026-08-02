import {
  tenantScopeContainsV1,
  type ExecutionAttemptV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ExecutionAttemptRepositoryPortV1,
  ExecutionAttemptTransactionPortV1,
} from '../application/execution-attempt-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, attempt: ExecutionAttemptV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, attempt.tenantScope);
}

function clone(attempt: ExecutionAttemptV1): ExecutionAttemptV1 {
  return Object.freeze({
    ...attempt,
    tenantScope: Object.freeze({ ...attempt.tenantScope }),
  });
}

/** In-memory JRA attempt adapter with tenant visibility and optimistic leases. */
export class InMemoryExecutionAttemptRepositoryAdapter implements ExecutionAttemptRepositoryPortV1 {
  private attempts = new Map<string, ExecutionAttemptV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, attempt: ExecutionAttemptV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, attempt)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.attempts.get(attempt.attemptId);
    if (existing && JSON.stringify(existing) === JSON.stringify(attempt)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_ATTEMPT');
    const duplicate = [...this.attempts.values()].find(
      (candidate) =>
        candidate.jobId === attempt.jobId && candidate.attemptNumber === attempt.attemptNumber,
    );
    if (duplicate) throw new Error('JRA_ATTEMPT_NUMBER_CONFLICT');
    this.attempts.set(attempt.attemptId, clone(attempt));
  }

  public async find(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
  ): Promise<ExecutionAttemptV1 | undefined> {
    await Promise.resolve();
    const attempt = this.attempts.get(attemptId);
    return attempt && visible(context.tenantScope, attempt.tenantScope)
      ? clone(attempt)
      : undefined;
  }

  public async findByJobAndNumber(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    attemptNumber: number,
  ): Promise<ExecutionAttemptV1 | undefined> {
    await Promise.resolve();
    const attempt = [...this.attempts.values()].find(
      (candidate) =>
        candidate.jobId === jobId &&
        candidate.attemptNumber === attemptNumber &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return attempt ? clone(attempt) : undefined;
  }

  public async update(
    context: IamTenantContextV1,
    attempt: ExecutionAttemptV1,
    expectedRevision: number,
  ): Promise<ExecutionAttemptV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, attempt)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.attempts.get(attempt.attemptId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      existing.jobId !== attempt.jobId ||
      existing.attemptNumber !== attempt.attemptNumber ||
      existing.executorId !== attempt.executorId ||
      existing.leaseTokenHash !== attempt.leaseTokenHash ||
      JSON.stringify(existing.tenantScope) !== JSON.stringify(attempt.tenantScope)
    )
      throw new Error('JRA_IMMUTABLE_ATTEMPT');
    this.attempts.set(attempt.attemptId, clone(attempt));
    return clone(attempt);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ExecutionAttemptTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.attempts);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        findByJobAndNumber: this.findByJobAndNumber.bind(this),
        update: this.update.bind(this),
      });
    } catch (error) {
      this.attempts = before;
      throw error;
    } finally {
      release();
    }
  }
}
