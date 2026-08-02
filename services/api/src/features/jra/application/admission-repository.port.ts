import type { JobDispatchRecordV1 } from '@databreeze/domain/dispatch/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const JRA_ADMISSION_REPOSITORY_PORT = Symbol('JRA_ADMISSION_REPOSITORY_PORT');

export interface JraAdmissionTransactionPortV1 {
  saveJob(context: IamTenantContextV1, job: JobV1): Promise<void>;
  findJobByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<JobV1 | undefined>;
  saveDispatch(context: IamTenantContextV1, record: JobDispatchRecordV1): Promise<void>;
  findDispatchByIdempotency(
    context: IamTenantContextV1,
    jobId: JobV1['jobId'],
    idempotencyKey: string,
  ): Promise<JobDispatchRecordV1 | undefined>;
}

export interface JraAdmissionRepositoryPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: JraAdmissionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
