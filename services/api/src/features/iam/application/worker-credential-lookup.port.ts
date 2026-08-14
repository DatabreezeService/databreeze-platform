import type { ServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

/**
 * Narrow root-composition port for authenticated processing workers. The worker boundary never
 * receives an IAM database client; only the current service-account projection crosses this port.
 */
export const WORKER_CREDENTIAL_LOOKUP_PORT = Symbol('WORKER_CREDENTIAL_LOOKUP_PORT');

export interface WorkerCredentialLookupPortV1 {
  findCurrentWorkerCredentialByDigest(secretDigest: string): Promise<ServiceAccountV1 | undefined>;
  findCurrentWorkerCredentialById(
    workerId: StableIdentifierV1,
  ): Promise<ServiceAccountV1 | undefined>;
}
