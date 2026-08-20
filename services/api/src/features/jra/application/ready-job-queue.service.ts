import {
  markJobDispatchDeliveredV1,
  type JobDispatchRecordV1,
} from '@databreeze/domain/dispatch/v1';
import { transitionJobV1, type JobV1 } from '@databreeze/domain/jobs/v1';
import { parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ReadyJobQueueRepositoryPortV1,
  ReadyJobQueueItemV1,
  ReadyJobQueueTransactionPortV1,
} from './ready-job-queue.port.js';

export type ReadyJobQueuePromotionCodeV1 =
  | 'INVALID_LIMIT'
  | 'INVALID_TIMESTAMP'
  | 'STALE_QUEUE_ITEM'
  | 'JOB_NOT_READY';

export interface ReadyJobQueuePromotionV1 {
  readonly job: JobV1;
  readonly dispatch: JobDispatchRecordV1;
}

export interface ReadyJobQueueResultV1 {
  readonly promoted: readonly ReadyJobQueuePromotionV1[];
  readonly skipped: readonly {
    readonly jobId: JobV1['jobId'];
    readonly code: ReadyJobQueuePromotionCodeV1;
  }[];
}

function isValidLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 100;
}

/**
 * Reconstructs durable ready work and atomically makes it claimable.
 *
 * Admission intentionally leaves a new job in CREATED while its immutable
 * descriptor and JOB_READY outbox row are written. This coordinator is the
 * PostgreSQL-authoritative bridge to QUEUED; Redis or an in-memory hint is
 * never allowed to stand in for the state transition.
 */
export class ReadyJobQueueService {
  public constructor(private readonly repository: ReadyJobQueueRepositoryPortV1) {}

  public async promote(
    context: IamTenantContextV1,
    now: string,
    limit: number,
  ): Promise<ReadyJobQueueResultV1 | { readonly accepted: false; readonly code: string }> {
    if (!isValidLimit(limit)) return Object.freeze({ accepted: false, code: 'INVALID_LIMIT' });
    const parsedNow = parseStrictUtcTimestampV1(now);
    if (!parsedNow.accepted) return Object.freeze({ accepted: false, code: 'INVALID_TIMESTAMP' });
    return this.repository.withTransaction(context, async (transaction) => {
      const pending = await transaction.listPending(context, limit);
      const promoted: ReadyJobQueuePromotionV1[] = [];
      const skipped: Array<{
        readonly jobId: JobV1['jobId'];
        readonly code: ReadyJobQueuePromotionCodeV1;
      }> = [];
      for (const item of pending) {
        const result = await this.promoteOne(transaction, context, item, parsedNow.value);
        if (result.accepted) promoted.push(result.value);
        else skipped.push({ jobId: item.job.jobId, code: result.code });
      }
      return Object.freeze({
        promoted: Object.freeze(promoted),
        skipped: Object.freeze(skipped),
      });
    });
  }

  private async promoteOne(
    transaction: ReadyJobQueueTransactionPortV1,
    context: IamTenantContextV1,
    item: ReadyJobQueueItemV1,
    now: string,
  ): Promise<
    | { readonly accepted: true; readonly value: ReadyJobQueuePromotionV1 }
    | { readonly accepted: false; readonly code: ReadyJobQueuePromotionCodeV1 }
  > {
    let job = item.job;
    if (job.state === 'CREATED') {
      const next = transitionJobV1(job, 'QUEUED', now);
      if (!next.accepted) return Object.freeze({ accepted: false, code: 'JOB_NOT_READY' });
      const updated = await transaction.updateJob(context, next.value, job.revision);
      if (!updated) return Object.freeze({ accepted: false, code: 'STALE_QUEUE_ITEM' });
      await transaction.recordTransition(context, {
        jobId: job.jobId,
        fromState: job.state,
        toState: next.value.state,
        occurredAt: now,
        revision: next.value.revision,
      });
      job = updated;
    } else if (job.state !== 'QUEUED') {
      return Object.freeze({ accepted: false, code: 'JOB_NOT_READY' });
    }
    const delivered = markJobDispatchDeliveredV1(item.dispatch, now);
    if (!delivered.accepted) return Object.freeze({ accepted: false, code: 'INVALID_TIMESTAMP' });
    const updatedDispatch = await transaction.updateDispatch(
      context,
      delivered.value,
      item.dispatch.revision,
    );
    if (!updatedDispatch) return Object.freeze({ accepted: false, code: 'STALE_QUEUE_ITEM' });
    return Object.freeze({
      accepted: true,
      value: Object.freeze({ job, dispatch: updatedDispatch }),
    });
  }
}
