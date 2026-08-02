import { tenantScopeContainsV1, type JobV1, type TenantScopeV1 } from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  JobRepositoryPortV1,
  JobTransactionPortV1,
} from '../application/job-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, job: JobV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, job.tenantScope);
}

function clone(job: JobV1): JobV1 {
  return Object.freeze({
    ...job,
    tenantScope: Object.freeze({ ...job.tenantScope }),
    action: Object.freeze({
      ...job.action,
      requiredCapabilities: Object.freeze([...job.action.requiredCapabilities]),
    }),
  });
}

function idempotencyKey(scope: TenantScopeV1, key: string): string {
  return `${JSON.stringify(scope)}\u0000${key}`;
}

/** In-memory JRA adapter mirroring immutable rows, revisions, and tenant indexes. */
export class InMemoryJobRepositoryAdapter implements JobRepositoryPortV1 {
  private jobs = new Map<string, JobV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, job: JobV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, job)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.jobs.get(job.jobId);
    if (existing && JSON.stringify(existing) === JSON.stringify(job)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_JOB');
    const duplicate = [...this.jobs.values()].find(
      (candidate) =>
        idempotencyKey(candidate.tenantScope, candidate.idempotencyKey) ===
        idempotencyKey(job.tenantScope, job.idempotencyKey),
    );
    if (duplicate) throw new Error('JRA_IDEMPOTENCY_CONFLICT');
    this.jobs.set(job.jobId, clone(job));
  }

  public async find(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
  ): Promise<JobV1 | undefined> {
    await Promise.resolve();
    const job = this.jobs.get(jobId);
    return job && visible(context.tenantScope, job.tenantScope) ? clone(job) : undefined;
  }

  public async findByIdempotency(
    context: IamTenantContextV1,
    key: string,
  ): Promise<JobV1 | undefined> {
    await Promise.resolve();
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.idempotencyKey === key && visible(context.tenantScope, candidate.tenantScope),
    );
    return job ? clone(job) : undefined;
  }

  public async update(
    context: IamTenantContextV1,
    job: JobV1,
    expectedRevision: number,
  ): Promise<JobV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, job)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.jobs.get(job.jobId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      JSON.stringify(existing.tenantScope) !== JSON.stringify(job.tenantScope) ||
      existing.requestedBy !== job.requestedBy ||
      existing.idempotencyKey !== job.idempotencyKey ||
      existing.inputManifestHash !== job.inputManifestHash
    )
      throw new Error('JRA_IMMUTABLE_JOB');
    this.jobs.set(job.jobId, clone(job));
    return clone(job);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: JobTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.jobs);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        findByIdempotency: this.findByIdempotency.bind(this),
        update: this.update.bind(this),
      });
    } catch (error) {
      this.jobs = before;
      throw error;
    } finally {
      release();
    }
  }
}
