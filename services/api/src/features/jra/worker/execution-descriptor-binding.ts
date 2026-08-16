import { createHash } from 'node:crypto';

import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface WorkerAttemptDescriptorBindingInputV1 {
  readonly descriptorHash: string;
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly workerId: StableIdentifierV1;
  readonly securityEpoch: number;
  readonly leaseExpiresAt: string;
}

/** JRA-006/JRA-023: canonical, content-free binding between one descriptor and one lease. */
export function workerAttemptDescriptorBindingHashV1(
  input: WorkerAttemptDescriptorBindingInputV1,
): string {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    descriptorHash: input.descriptorHash,
    attemptId: input.attemptId,
    jobId: input.jobId,
    workerId: input.workerId,
    securityEpoch: input.securityEpoch,
    leaseExpiresAt: input.leaseExpiresAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
