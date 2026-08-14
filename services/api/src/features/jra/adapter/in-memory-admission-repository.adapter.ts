import {
  tenantScopeContainsV1,
  type JobDispatchRecordV1,
  type JobV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  JraAdmissionRepositoryPortV1,
  JraAdmissionTransactionPortV1,
} from '../application/admission-repository.port.js';
import type { ExecutionRequestDescriptorV1 } from '../application/execution-request-descriptor.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate);
}

function cloneJob(job: JobV1): JobV1 {
  return Object.freeze({
    ...job,
    tenantScope: Object.freeze({ ...job.tenantScope }),
    action: Object.freeze({
      ...job.action,
      requiredCapabilities: Object.freeze([...job.action.requiredCapabilities]),
    }),
  });
}

function cloneDispatch(record: JobDispatchRecordV1): JobDispatchRecordV1 {
  return Object.freeze({ ...record, tenantScope: Object.freeze({ ...record.tenantScope }) });
}

function cloneExecutionRequest(
  descriptor: ExecutionRequestDescriptorV1,
): ExecutionRequestDescriptorV1 {
  return structuredClone(descriptor);
}

/** Atomic in-memory admission adapter for the JRA job plus dispatch boundary. */
export class InMemoryAdmissionRepositoryAdapter implements JraAdmissionRepositoryPortV1 {
  private jobs = new Map<string, JobV1>();
  private executionRequests = new Map<string, ExecutionRequestDescriptorV1>();
  private dispatches = new Map<string, JobDispatchRecordV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  private saveJob(context: IamTenantContextV1, job: JobV1): void {
    if (!mutable(context, job.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.jobs.get(job.jobId);
    if (existing && JSON.stringify(existing) === JSON.stringify(job)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_JOB');
    const duplicate = [...this.jobs.values()].find(
      (candidate) =>
        candidate.idempotencyKey === job.idempotencyKey &&
        JSON.stringify(candidate.tenantScope) === JSON.stringify(job.tenantScope),
    );
    if (duplicate) throw new Error('JRA_IDEMPOTENCY_CONFLICT');
    this.jobs.set(job.jobId, cloneJob(job));
  }

  private findJobByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): JobV1 | undefined {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.idempotencyKey === idempotencyKey &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return job ? cloneJob(job) : undefined;
  }

  private saveExecutionRequest(
    context: IamTenantContextV1,
    descriptor: ExecutionRequestDescriptorV1,
  ): void {
    if (!mutable(context, descriptor.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.executionRequests.get(descriptor.jobId);
    if (existing?.canonicalHash === descriptor.canonicalHash) return;
    if (existing) throw new Error('JRA_IMMUTABLE_EXECUTION_REQUEST');
    this.executionRequests.set(descriptor.jobId, cloneExecutionRequest(descriptor));
  }

  private findExecutionRequestByJob(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
  ): ExecutionRequestDescriptorV1 | undefined {
    const descriptor = this.executionRequests.get(jobId);
    if (!descriptor || !visible(context.tenantScope, descriptor.tenantScope)) return undefined;
    return cloneExecutionRequest(descriptor);
  }

  private saveDispatch(context: IamTenantContextV1, record: JobDispatchRecordV1): void {
    if (!mutable(context, record.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.dispatches.get(record.dispatchId);
    if (existing && JSON.stringify(existing) === JSON.stringify(record)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_DISPATCH');
    const duplicate = [...this.dispatches.values()].find(
      (candidate) =>
        candidate.jobId === record.jobId && candidate.idempotencyKey === record.idempotencyKey,
    );
    if (duplicate) throw new Error('JRA_DISPATCH_IDEMPOTENCY_CONFLICT');
    this.dispatches.set(record.dispatchId, cloneDispatch(record));
  }

  private findDispatchByIdempotency(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    idempotencyKey: string,
  ): JobDispatchRecordV1 | undefined {
    const record = [...this.dispatches.values()].find(
      (candidate) =>
        candidate.jobId === jobId &&
        candidate.idempotencyKey === idempotencyKey &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return record ? cloneDispatch(record) : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: JraAdmissionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = {
      jobs: new Map(this.jobs),
      executionRequests: new Map(this.executionRequests),
      dispatches: new Map(this.dispatches),
    };
    try {
      return await work({
        saveJob: async (_context, job) => {
          await Promise.resolve();
          this.saveJob(context, job);
        },
        findJobByIdempotency: async (_context, key) => {
          await Promise.resolve();
          return this.findJobByIdempotency(context, key);
        },
        saveExecutionRequest: async (_context, descriptor) => {
          await Promise.resolve();
          this.saveExecutionRequest(context, descriptor);
        },
        findExecutionRequestByJob: async (_context, jobId) => {
          await Promise.resolve();
          return this.findExecutionRequestByJob(context, jobId);
        },
        saveDispatch: async (_context, record) => {
          await Promise.resolve();
          this.saveDispatch(context, record);
        },
        findDispatchByIdempotency: async (_context, jobId, key) => {
          await Promise.resolve();
          return this.findDispatchByIdempotency(context, jobId, key);
        },
      });
    } catch (error) {
      this.jobs = before.jobs;
      this.executionRequests = before.executionRequests;
      this.dispatches = before.dispatches;
      throw error;
    } finally {
      release();
    }
  }
}
