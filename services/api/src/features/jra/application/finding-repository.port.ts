import type { FindingV1, ReviewTaskV1 } from '@databreeze/domain/finding/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const FINDING_REPOSITORY_PORT = Symbol('FINDING_REPOSITORY_PORT');

export interface FindingTransactionPortV1 {
  saveFinding(context: IamTenantContextV1, finding: FindingV1): Promise<void>;
  findFinding(
    context: IamTenantContextV1,
    findingId: StableIdentifierV1,
  ): Promise<FindingV1 | undefined>;
  updateFinding(
    context: IamTenantContextV1,
    finding: FindingV1,
    expectedRevision: number,
  ): Promise<FindingV1 | undefined>;
  saveReviewTask(context: IamTenantContextV1, task: ReviewTaskV1): Promise<void>;
  findReviewTask(
    context: IamTenantContextV1,
    reviewTaskId: StableIdentifierV1,
  ): Promise<ReviewTaskV1 | undefined>;
  updateReviewTask(
    context: IamTenantContextV1,
    task: ReviewTaskV1,
    expectedRevision: number,
  ): Promise<ReviewTaskV1 | undefined>;
}

export interface FindingRepositoryPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: FindingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
