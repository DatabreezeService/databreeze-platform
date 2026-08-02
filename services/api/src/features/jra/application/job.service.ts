import {
  createJobV1,
  createTypedActionDefinitionV1,
  transitionJobV1,
  type JobResultV1,
  type JobStateV1,
  type JobV1,
} from '@databreeze/domain/jobs/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { JobRepositoryPortV1 } from './job-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'INVALID_REVISION' | 'INVALID_TRANSITION',
): JobResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates immutable typed jobs and optimistic state transitions. */
export class JobService {
  public constructor(private readonly repository: JobRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Omit<Parameters<typeof createJobV1>[0], 'action'> & {
      readonly action: Parameters<typeof createTypedActionDefinitionV1>[0];
    },
  ): Promise<JobResultV1<JobV1>> {
    const existing =
      typeof input.idempotencyKey === 'string'
        ? await this.repository.findByIdempotency(context, input.idempotencyKey)
        : undefined;
    if (existing) return Object.freeze({ accepted: true, value: existing });
    const action = createTypedActionDefinitionV1(input.action);
    if (!action.accepted) return action;
    const created = createJobV1({ ...input, action: action.value });
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const replay = await transaction.findByIdempotency(context, created.value.idempotencyKey);
      if (replay) return Object.freeze({ accepted: true, value: replay });
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async transition(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
    nextState: JobStateV1,
    now: unknown,
    expectedRevision: number,
  ): Promise<JobResultV1<JobV1>> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return rejected('INVALID_REVISION');
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, jobId);
      if (!current) return rejected('INVALID_IDENTIFIER');
      if (current.revision !== expectedRevision) return rejected('INVALID_REVISION');
      const next = transitionJobV1(current, nextState, now);
      if (!next.accepted) return next;
      const updated = await transaction.update(context, next.value, expectedRevision);
      if (!updated) return rejected('INVALID_REVISION');
      return Object.freeze({ accepted: true, value: updated });
    });
  }

  public find(context: IamTenantContextV1, jobId: StableIdentifierV1): Promise<JobV1 | undefined> {
    return this.repository.find(context, jobId);
  }
}
