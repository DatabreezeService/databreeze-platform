import type { JobDispatchRecordV1 } from '@databreeze/domain/dispatch/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const READY_JOB_QUEUE_REPOSITORY_PORT = Symbol('READY_JOB_QUEUE_REPOSITORY_PORT');

export interface ReadyJobQueueItemV1 {
  readonly job: JobV1;
  readonly dispatch: JobDispatchRecordV1;
}

export interface ReadyJobQueueTransactionPortV1 {
  listPending(context: IamTenantContextV1, limit: number): Promise<readonly ReadyJobQueueItemV1[]>;
  updateJob(
    context: IamTenantContextV1,
    job: JobV1,
    expectedRevision: number,
  ): Promise<JobV1 | undefined>;
  recordTransition(
    context: IamTenantContextV1,
    input: {
      readonly jobId: JobV1['jobId'];
      readonly fromState: JobV1['state'];
      readonly toState: JobV1['state'];
      readonly occurredAt: string;
      readonly revision: number;
    },
  ): Promise<void>;
  updateDispatch(
    context: IamTenantContextV1,
    record: JobDispatchRecordV1,
    expectedRevision: number,
  ): Promise<JobDispatchRecordV1 | undefined>;
}

export interface ReadyJobQueueRepositoryPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ReadyJobQueueTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
