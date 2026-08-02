import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const EXECUTION_ATTEMPT_REPOSITORY_PORT = Symbol('EXECUTION_ATTEMPT_REPOSITORY_PORT');

export interface ExecutionAttemptTransactionPortV1 {
  save(context: IamTenantContextV1, attempt: ExecutionAttemptV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
  ): Promise<ExecutionAttemptV1 | undefined>;
  findByJobAndNumber(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    attemptNumber: number,
  ): Promise<ExecutionAttemptV1 | undefined>;
  update(
    context: IamTenantContextV1,
    attempt: ExecutionAttemptV1,
    expectedRevision: number,
  ): Promise<ExecutionAttemptV1 | undefined>;
}

export interface ExecutionAttemptRepositoryPortV1 extends ExecutionAttemptTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ExecutionAttemptTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
