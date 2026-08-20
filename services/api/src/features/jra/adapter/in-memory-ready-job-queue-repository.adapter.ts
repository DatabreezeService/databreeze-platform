import {
  tenantScopeContainsV1,
  type JobDispatchRecordV1,
  type JobV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ReadyJobQueueRepositoryPortV1,
  ReadyJobQueueTransactionPortV1,
  ReadyJobQueueItemV1,
} from '../application/ready-job-queue.port.js';

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

function cloneDispatch(dispatch: JobDispatchRecordV1): JobDispatchRecordV1 {
  return Object.freeze({ ...dispatch, tenantScope: Object.freeze({ ...dispatch.tenantScope }) });
}

function cloneItem(item: ReadyJobQueueItemV1): ReadyJobQueueItemV1 {
  return Object.freeze({ job: cloneJob(item.job), dispatch: cloneDispatch(item.dispatch) });
}

/** Test/local adapter that preserves the same CAS and transaction semantics as PostgreSQL. */
export class InMemoryReadyJobQueueRepositoryAdapter implements ReadyJobQueueRepositoryPortV1 {
  private jobs = new Map<string, JobV1>();
  private dispatches = new Map<string, JobDispatchRecordV1>();
  private transitions: Array<{
    readonly jobId: string;
    readonly fromState: string;
    readonly toState: string;
    readonly actorId: string;
    readonly occurredAt: string;
    readonly revision: number;
  }> = [];
  private transactionTail: Promise<void> = Promise.resolve();

  public seed(item: ReadyJobQueueItemV1): void {
    this.jobs.set(item.job.jobId, cloneJob(item.job));
    this.dispatches.set(item.dispatch.dispatchId, cloneDispatch(item.dispatch));
  }

  public getTransitions(): readonly (typeof this.transitions)[number][] {
    return this.transitions.map((transition) => Object.freeze({ ...transition }));
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ReadyJobQueueTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeJobs = new Map(this.jobs);
    const beforeDispatches = new Map(this.dispatches);
    const beforeTransitions = [...this.transitions];
    try {
      return await work({
        listPending: async (_context, limit) => {
          await Promise.resolve();
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
          const items: ReadyJobQueueItemV1[] = [];
          for (const dispatch of [...this.dispatches.values()].sort(
            (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
          )) {
            if (dispatch.deliveredAt || dispatch.eventType !== 'JOB_READY') continue;
            const job = this.jobs.get(dispatch.jobId);
            if (!job || !visible(context.tenantScope, job.tenantScope)) continue;
            items.push(cloneItem({ job, dispatch }));
            if (items.length >= limit) break;
          }
          return items;
        },
        updateJob: async (_context, job, expectedRevision) => {
          await Promise.resolve();
          const existing = this.jobs.get(job.jobId);
          if (!existing || existing.revision !== expectedRevision) return undefined;
          if (!mutable(context, job.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
          if (
            existing.requestedBy !== job.requestedBy ||
            existing.idempotencyKey !== job.idempotencyKey ||
            existing.inputManifestHash !== job.inputManifestHash ||
            JSON.stringify(existing.tenantScope) !== JSON.stringify(job.tenantScope)
          )
            throw new Error('JRA_IMMUTABLE_JOB');
          this.jobs.set(job.jobId, cloneJob(job));
          return cloneJob(job);
        },
        recordTransition: async (_context, input) => {
          await Promise.resolve();
          const job = this.jobs.get(input.jobId);
          if (!job || !mutable(context, job.tenantScope))
            throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
          this.transitions.push({ ...input, actorId: context.actorId });
        },
        updateDispatch: async (_context, record, expectedRevision) => {
          await Promise.resolve();
          const existing = this.dispatches.get(record.dispatchId);
          if (!existing || existing.revision !== expectedRevision) return undefined;
          if (!mutable(context, record.tenantScope))
            throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
          if (
            existing.jobId !== record.jobId ||
            existing.eventType !== record.eventType ||
            existing.payloadHash !== record.payloadHash ||
            existing.idempotencyKey !== record.idempotencyKey ||
            JSON.stringify(existing.tenantScope) !== JSON.stringify(record.tenantScope)
          )
            throw new Error('JRA_IMMUTABLE_DISPATCH');
          this.dispatches.set(record.dispatchId, cloneDispatch(record));
          return cloneDispatch(record);
        },
      });
    } catch (error) {
      this.jobs = beforeJobs;
      this.dispatches = beforeDispatches;
      this.transitions = beforeTransitions;
      throw error;
    } finally {
      release();
    }
  }
}
