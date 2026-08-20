import type { JobV1 } from '@databreeze/domain/jobs/v1';
import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';

import type {
  IaeWorkerIdentityV1,
  IaeWorkerInputObjectGrantV1,
  IaeWorkerResultAcceptanceCapabilityV1,
} from '../../iae/application/worker-object-capability.port.js';
import type {
  IaeWorkerCapabilityResultV1,
  IaeWorkerObjectCapabilityPortV1,
} from '../../iae/application/worker-object-capability.service.js';
import type {
  WorkerIdentityV1,
  WorkerInputGrantV1,
  WorkerObjectGrantAuthorityPortV1,
  WorkerOutputGrantV1,
} from './worker-ports.js';

function identity(value: WorkerIdentityV1): IaeWorkerIdentityV1 {
  return value;
}

function failureCode<TValue>(result: IaeWorkerCapabilityResultV1<TValue>): never {
  if (result.accepted) throw new Error('IAE_WORKER_CAPABILITY_INTERNAL_RESULT');
  throw new Error(`IAE_WORKER_OBJECT_GRANT_${result.code}`);
}

function inputGrant(value: IaeWorkerInputObjectGrantV1): WorkerInputGrantV1 {
  return Object.freeze({
    grantType: 'JOB_INPUT' as const,
    attemptId: value.attemptId,
    jobId: value.jobId,
    workerId: value.workerId,
    securityEpoch: value.securityEpoch,
    tenantScope: value.tenantScope,
    objectIds: value.objectIds,
    expiresAt: value.expiresAt,
    capabilityId: value.capabilityId,
    actions: value.actions,
    maxBytes: value.maxBytes,
    issuedAt: value.issuedAt,
    signedCapability: value.signedCapability,
  });
}

function outputGrant(value: IaeWorkerResultAcceptanceCapabilityV1): WorkerOutputGrantV1 {
  return Object.freeze({
    grantType: 'JOB_OUTPUT' as const,
    attemptId: value.attemptId,
    jobId: value.jobId,
    workerId: value.workerId,
    securityEpoch: value.securityEpoch,
    tenantScope: value.tenantScope,
    objectId: value.objectId,
    expiresAt: value.expiresAt,
    capabilityId: value.capabilityId,
    action: value.action,
    maxBytes: value.maxBytes,
    issuedAt: value.issuedAt,
    signedCapability: value.signedCapability,
  });
}

/** JRA adapter: JRA owns job/attempt admission; IAE owns object capabilities and receipts. */
export class IaeWorkerObjectGrantAuthorityAdapter implements WorkerObjectGrantAuthorityPortV1 {
  public constructor(private readonly capabilities: IaeWorkerObjectCapabilityPortV1) {}

  public async issueInputGrant(
    worker: WorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    inputObjectIds?: readonly string[],
  ): Promise<WorkerInputGrantV1> {
    const result = await this.capabilities.issueInputGrant(
      identity(worker),
      job,
      attempt,
      undefined,
      inputObjectIds === undefined ? undefined : { inputObjectIds },
    );
    if (!result.accepted) return failureCode(result);
    return inputGrant(result.value);
  }

  public async acceptResultReferences(
    worker: WorkerIdentityV1,
    job: JobV1,
    attempt: ExecutionAttemptV1,
    references: readonly string[],
  ): Promise<readonly WorkerOutputGrantV1[]> {
    const result = await this.capabilities.acceptResultReferences(
      identity(worker),
      job,
      attempt,
      references,
    );
    if (!result.accepted) return failureCode(result);
    return result.value.map(outputGrant);
  }
}
