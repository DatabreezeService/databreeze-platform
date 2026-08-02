import {
  completeExecutionAttemptV1,
  createExecutionAttemptV1,
  expireExecutionAttemptV1,
  renewExecutionAttemptLeaseV1,
  startExecutionAttemptV1,
  type ExecutionAttemptResultV1,
  type ExecutionAttemptV1,
} from '@databreeze/domain/execution-attempt/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ExecutionAttemptRepositoryPortV1 } from './execution-attempt-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'INVALID_NUMBER' | 'INVALID_REVISION',
): ExecutionAttemptResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates durable execution attempts, leases, and stale-result rejection. */
export class ExecutionAttemptService {
  public constructor(private readonly repository: ExecutionAttemptRepositoryPortV1) {}

  public async claim(
    context: IamTenantContextV1,
    input: Parameters<typeof createExecutionAttemptV1>[0],
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    const created = createExecutionAttemptV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findByJobAndNumber(
        context,
        created.value.jobId,
        created.value.attemptNumber,
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

  public async start(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: unknown,
    expectedRevision: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, attemptId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = startExecutionAttemptV1(current, leaseTokenHash, now);
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }

  public async heartbeat(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: unknown,
    nextLeaseExpiresAt: unknown,
    expectedRevision: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, attemptId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = renewExecutionAttemptLeaseV1(current, leaseTokenHash, now, nextLeaseExpiresAt);
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }

  public async complete(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
    now: unknown,
    expectedRevision: number,
    resultManifestHash?: string,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, attemptId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = completeExecutionAttemptV1(
        current,
        leaseTokenHash,
        outcome,
        now,
        resultManifestHash,
      );
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }

  public async expire(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    now: unknown,
    expectedRevision: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, attemptId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = expireExecutionAttemptV1(current, now);
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      return updated
        ? Object.freeze({ accepted: true, value: updated })
        : rejected('INVALID_REVISION');
    });
  }
}
