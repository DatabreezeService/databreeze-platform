import {
  createJobDispatchRecordV1,
  markJobDispatchDeliveredV1,
  type DispatchResultV1,
  type JobDispatchRecordV1,
} from '@databreeze/domain/dispatch/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DispatchRepositoryPortV1 } from './dispatch-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'INVALID_REVISION',
): DispatchResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates an authoritative dispatch outbox with replay-safe delivery. */
export class DispatchService {
  public constructor(private readonly repository: DispatchRepositoryPortV1) {}

  public async enqueue(
    context: IamTenantContextV1,
    input: Parameters<typeof createJobDispatchRecordV1>[0],
  ): Promise<DispatchResultV1<JobDispatchRecordV1>> {
    const created = createJobDispatchRecordV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findByIdempotency(
        context,
        created.value.jobId,
        created.value.idempotencyKey,
      );
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public pending(
    context: IamTenantContextV1,
    limit: number,
  ): Promise<readonly JobDispatchRecordV1[]> {
    return this.repository.listPending(context, limit);
  }

  public async markDelivered(
    context: IamTenantContextV1,
    dispatchId: StableIdentifierV1,
    deliveredAt: unknown,
    expectedRevision: number,
  ): Promise<DispatchResultV1<JobDispatchRecordV1>> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return rejected('INVALID_REVISION');
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, dispatchId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = markJobDispatchDeliveredV1(current, deliveredAt);
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }
}
