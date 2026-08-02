import type { JobV1 } from '@databreeze/domain/jobs/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const JOB_REPOSITORY_PORT = Symbol('JOB_REPOSITORY_PORT');

export interface JobTransactionPortV1 {
  save(context: IamTenantContextV1, job: JobV1): Promise<void>;
  find(context: IamTenantContextV1, jobId: StableIdentifierV1): Promise<JobV1 | undefined>;
  findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<JobV1 | undefined>;
  update(
    context: IamTenantContextV1,
    job: JobV1,
    expectedRevision: number,
  ): Promise<JobV1 | undefined>;
}

export interface JobRepositoryPortV1 extends JobTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: JobTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
