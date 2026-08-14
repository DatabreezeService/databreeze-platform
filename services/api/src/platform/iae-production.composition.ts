import type {
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilitySignerPortV1,
  IaeWorkerInputObjectResolverPortV1,
  IaeWorkerOutputObjectResolverPortV1,
  IaeWorkerSecurityEpochPortV1,
} from '../features/iae/application/worker-object-capability.port.js';
import {
  IaeWorkerObjectCapabilityService,
  type IaeWorkerObjectCapabilityPortV1,
} from '../features/iae/application/worker-object-capability.service.js';
import type { WorkerSecurityEpochPortV1 } from '../features/jra/worker/worker-ports.js';
import {
  PrismaWorkerObjectCapabilityRepositoryAdapter,
  type WorkerObjectCapabilityDatabaseClientV1,
} from '../features/iae/adapter/prisma-worker-object-capability-repository.adapter.js';

export interface IaeWorkerCapabilityCompositionOptionsV1 {
  readonly capability?: IaeWorkerObjectCapabilityPortV1 | undefined;
  readonly repository?: IaeWorkerCapabilityRepositoryPortV1 | undefined;
  readonly database?: WorkerObjectCapabilityDatabaseClientV1 | undefined;
  readonly inputResolver?: IaeWorkerInputObjectResolverPortV1 | undefined;
  readonly outputResolver?: IaeWorkerOutputObjectResolverPortV1 | undefined;
  readonly signer?: IaeWorkerCapabilitySignerPortV1 | undefined;
  readonly securityEpoch?: IaeWorkerSecurityEpochPortV1 | undefined;
  readonly workerSecurityEpoch?: WorkerSecurityEpochPortV1 | undefined;
}

/**
 * Root-only composition of IAE's worker capability service. A production capability service is
 * composed only when durable storage, object policy, signing, and current-epoch authorities are
 * all explicit; missing pieces return undefined so JRA fails closed instead of fabricating refs.
 */
export function composeIaeWorkerObjectCapability(
  options: IaeWorkerCapabilityCompositionOptionsV1,
): IaeWorkerObjectCapabilityPortV1 | undefined {
  if (options.capability) return options.capability;
  const repository =
    options.repository ??
    (options.database === undefined
      ? undefined
      : new PrismaWorkerObjectCapabilityRepositoryAdapter(options.database));
  const epoch =
    options.securityEpoch ??
    (options.workerSecurityEpoch === undefined
      ? undefined
      : ({
          isCurrent: (identity) => options.workerSecurityEpoch!.isCurrent(identity),
        } satisfies IaeWorkerSecurityEpochPortV1));
  if (
    repository === undefined ||
    options.inputResolver === undefined ||
    options.outputResolver === undefined ||
    options.signer === undefined ||
    epoch === undefined
  )
    return undefined;
  return new IaeWorkerObjectCapabilityService(
    repository,
    options.inputResolver,
    options.outputResolver,
    options.signer,
    epoch,
  );
}
