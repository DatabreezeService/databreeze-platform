import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const JOB_HISTORY_READ_PORT = Symbol('JOB_HISTORY_READ_PORT');

export type JobHistoryStateV1 =
  | 'CREATED'
  | 'QUEUED'
  | 'WAITING_FOR_DEVICE'
  | 'DISPATCHED'
  | 'RUNNING'
  | 'NEEDS_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'SUCCEEDED'
  | 'PARTIALLY_SUCCEEDED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type JobHistoryApprovalStateV1 = 'NOT_APPLICABLE' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Metadata safe for a user-facing history view; no hashes, object IDs, parameters, or leases. */
export interface JobHistoryEntryV1 {
  readonly schemaVersion: 4;
  readonly jobId: StableIdentifierV1;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly state: JobHistoryStateV1;
  readonly revision: number;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly resultAvailable: boolean;
  readonly approvalState: JobHistoryApprovalStateV1;
}

export interface JobHistoryListQueryV1 {
  readonly limit: number;
  readonly cursor?: string;
}

export interface JobHistoryPageV1 {
  readonly items: readonly JobHistoryEntryV1[];
  readonly nextCursor?: string;
}

export interface JobHistoryReadPortV1 {
  list(context: IamTenantContextV1, query: JobHistoryListQueryV1): Promise<JobHistoryPageV1>;
  find(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
  ): Promise<JobHistoryEntryV1 | undefined>;
}

/** Production-safe default: the route is visible but never invents execution history. */
export class UnavailableJobHistoryReadAdapter implements JobHistoryReadPortV1 {
  public list(): Promise<JobHistoryPageV1> {
    return Promise.reject(new Error('JRA_JOB_HISTORY_UNAVAILABLE'));
  }

  public find(): Promise<JobHistoryEntryV1 | undefined> {
    return Promise.reject(new Error('JRA_JOB_HISTORY_UNAVAILABLE'));
  }
}
