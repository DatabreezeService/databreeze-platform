import {
  createFindingV1,
  createReviewTaskV1,
  resolveFindingV1,
  transitionReviewTaskV1,
  type FindingResultV1,
  type FindingV1,
  type ReviewTaskV1,
} from '@databreeze/domain/finding/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { FindingRepositoryPortV1 } from './finding-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'INVALID_REVISION',
): FindingResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates canonical findings, review tasks, and versioned resolutions. */
export class FindingService {
  public constructor(private readonly repository: FindingRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createFindingV1>[0],
  ): Promise<FindingResultV1<FindingV1>> {
    const created = createFindingV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findFinding(context, created.value.findingId);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.saveFinding(context, created.value);
      return created;
    });
  }

  public async resolve(
    context: IamTenantContextV1,
    findingId: StableIdentifierV1,
    disposition: 'FIXED' | 'DISMISSED' | 'SUPPRESSED',
    resolvedAt: unknown,
    note: string,
    expectedRevision: number,
  ): Promise<FindingResultV1<FindingV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.findFinding(context, findingId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = resolveFindingV1(current, disposition, resolvedAt, note);
      if (!next.accepted) return next;
      const updated = await transaction.updateFinding(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }

  public async createReviewTask(
    context: IamTenantContextV1,
    input: Parameters<typeof createReviewTaskV1>[0],
  ): Promise<FindingResultV1<ReviewTaskV1>> {
    const created = createReviewTaskV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const finding = await transaction.findFinding(context, created.value.findingId);
      if (!finding) return rejected('INVALID_IDENTIFIER');
      const existing = await transaction.findReviewTask(context, created.value.reviewTaskId);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.saveReviewTask(context, created.value);
      return created;
    });
  }

  public async transitionReviewTask(
    context: IamTenantContextV1,
    reviewTaskId: StableIdentifierV1,
    nextState: 'OPEN' | 'CLAIMED' | 'RETURNED' | 'COMPLETED',
    expectedRevision: number,
  ): Promise<FindingResultV1<ReviewTaskV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.findReviewTask(context, reviewTaskId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = transitionReviewTaskV1(current, nextState, expectedRevision);
      if (!next.accepted) return next;
      const updated = await transaction.updateReviewTask(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }
}
