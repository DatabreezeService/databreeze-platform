import type { JobDispatchRecordV1 } from '@databreeze/domain/dispatch/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DISPATCH_REPOSITORY_PORT = Symbol('DISPATCH_REPOSITORY_PORT');

export interface DispatchTransactionPortV1 {
  save(context: IamTenantContextV1, record: JobDispatchRecordV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    dispatchId: StableIdentifierV1,
  ): Promise<JobDispatchRecordV1 | undefined>;
  findByIdempotency(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    idempotencyKey: string,
  ): Promise<JobDispatchRecordV1 | undefined>;
  listPending(context: IamTenantContextV1, limit: number): Promise<readonly JobDispatchRecordV1[]>;
  update(
    context: IamTenantContextV1,
    record: JobDispatchRecordV1,
    expectedRevision: number,
  ): Promise<JobDispatchRecordV1 | undefined>;
}

export interface DispatchRepositoryPortV1 extends DispatchTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DispatchTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
