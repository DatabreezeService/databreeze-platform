import {
  createJobDispatchRecordV1,
  type DispatchResultV1,
  type JobDispatchRecordV1,
} from '@databreeze/domain/dispatch/v1';
import {
  createJobV1,
  createTypedActionDefinitionV1,
  type JobResultV1,
  type JobV1,
} from '@databreeze/domain/jobs/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { JraAdmissionRepositoryPortV1 } from './admission-repository.port.js';

export interface JraAdmissionValueV1 {
  readonly job: JobV1;
  readonly dispatch: JobDispatchRecordV1;
}

export type JraAdmissionResultV1 =
  | { readonly accepted: true; readonly value: JraAdmissionValueV1 }
  | { readonly accepted: false; readonly code: string };

function rejected(code: string): JraAdmissionResultV1 {
  return Object.freeze({ accepted: false, code });
}

/** Commits a typed job and its first dispatch outbox record atomically. */
export class JraAdmissionService {
  public constructor(private readonly repository: JraAdmissionRepositoryPortV1) {}

  public async admit(
    context: IamTenantContextV1,
    input: {
      readonly job: Omit<Parameters<typeof createJobV1>[0], 'action'> & {
        readonly action: Parameters<typeof createTypedActionDefinitionV1>[0];
      };
      readonly dispatch: Omit<Parameters<typeof createJobDispatchRecordV1>[0], 'jobId'> & {
        readonly jobId: Parameters<typeof createJobV1>[0]['jobId'];
      };
    },
  ): Promise<JraAdmissionResultV1> {
    const action = createTypedActionDefinitionV1(input.job.action);
    if (!action.accepted) return action as JobResultV1<never>;
    const job = createJobV1({ ...input.job, action: action.value });
    if (!job.accepted) return job as JobResultV1<never>;
    if (input.dispatch.jobId !== job.value.jobId) return rejected('INVALID_IDENTIFIER');
    const dispatch = createJobDispatchRecordV1(input.dispatch);
    if (!dispatch.accepted) return dispatch as DispatchResultV1<never>;
    return this.repository.withTransaction(context, async (transaction) => {
      const existingJob = await transaction.findJobByIdempotency(context, job.value.idempotencyKey);
      const existingDispatch = await transaction.findDispatchByIdempotency(
        context,
        job.value.jobId,
        dispatch.value.idempotencyKey,
      );
      if (existingJob || existingDispatch) {
        if (
          existingJob &&
          existingDispatch &&
          JSON.stringify(existingJob) === JSON.stringify(job.value) &&
          JSON.stringify(existingDispatch) === JSON.stringify(dispatch.value)
        )
          return Object.freeze({
            accepted: true,
            value: { job: existingJob, dispatch: existingDispatch },
          });
        return rejected('JRA_ADMISSION_IDEMPOTENCY_CONFLICT');
      }
      await transaction.saveJob(context, job.value);
      await transaction.saveDispatch(context, dispatch.value);
      return Object.freeze({ accepted: true, value: { job: job.value, dispatch: dispatch.value } });
    });
  }
}
