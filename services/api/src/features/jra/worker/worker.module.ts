import { type DynamicModule, Module } from '@nestjs/common';

import {
  UnavailableWorkerBoundary,
  WorkerBoundary,
  type WorkerBoundaryDependenciesV1,
  type WorkerBoundaryPortV1,
} from './worker-boundary.js';
import { WorkerController } from './worker.controller.js';
import {
  WORKER_ATTEMPT_AUTHORITY_PORT,
  WORKER_AUTHENTICATOR_PORT,
  WORKER_COMPLETION_TRANSACTION_PORT,
  WORKER_OBJECT_GRANT_AUTHORITY_PORT,
  type WorkerAttemptAuthorityPortV1,
  type WorkerAttemptMutationPortV1,
  type WorkerAssignmentPortV1,
  type WorkerAuthenticatorPortV1,
  type WorkerCompletionTransactionPortV1,
  type WorkerObjectGrantAuthorityPortV1,
  type WorkerWorkloadEnvelopeAuthorityPortV1,
} from './worker-ports.js';
import { WORKER_BOUNDARY } from './worker-ports.js';
import type { WorkerSecurityEpochPortV1 } from './worker-ports.js';
import type { JraWorkerDatabaseClientV1 } from './prisma-worker-adapter.js';
import type { WorkerCredentialLookupPortV1 } from '../../iam/application/worker-credential-lookup.port.js';
import {
  WORKER_RESULT_PREPARATION_PORT,
  WORKER_RESULT_WRITE_CAPABILITY_AUTHORITY_PORT,
  type WorkerResultPreparationPortV1,
  type WorkerResultWriteCapabilityAuthorityPortV1,
} from './worker-result-preparation.port.js';
import {
  WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
  WORKER_RESULT_FINALIZATION_PORT,
  WORKER_VERIFIED_RESULT_MANIFEST_PORT,
  type WorkerResultAttestationResolverPortV1,
  type WorkerResultFinalizationPortV1,
  type WorkerVerifiedResultManifestPortV1,
} from './worker-result-finalization.port.js';

export interface JraWorkerModuleOptions {
  /** Shared generated Prisma client narrowed at the application root. */
  readonly jraWorkerDatabase?: JraWorkerDatabaseClientV1;
  /** IAM service-account/device epoch projection composed at the application root. */
  readonly workerCredentialLookup?: WorkerCredentialLookupPortV1;
  readonly workerSecurityEpoch?: WorkerSecurityEpochPortV1;
  /** A fully composed durable boundary may be supplied by an integration owner. */
  readonly workerBoundary?: WorkerBoundaryPortV1;
  readonly workerAttempts?: WorkerAttemptMutationPortV1;
  readonly workerAssignment?: WorkerAssignmentPortV1;
  readonly workerAuthenticator?: WorkerAuthenticatorPortV1;
  readonly workerAttemptAuthority?: WorkerAttemptAuthorityPortV1;
  readonly workerObjectGrantAuthority?: WorkerObjectGrantAuthorityPortV1;
  readonly workerCompletionTransaction?: WorkerCompletionTransactionPortV1;
  readonly workerWorkloadEnvelope?: WorkerWorkloadEnvelopeAuthorityPortV1;
  readonly workerResultPreparation?: WorkerResultPreparationPortV1;
  readonly workerResultWriteCapabilities?: WorkerResultWriteCapabilityAuthorityPortV1;
  readonly workerResultFinalization?: WorkerResultFinalizationPortV1;
  readonly workerResultAttestations?: WorkerResultAttestationResolverPortV1;
  readonly workerVerifiedResultManifests?: WorkerVerifiedResultManifestPortV1;
  readonly workerNow?: () => string;
}

function composeBoundary(options: JraWorkerModuleOptions): WorkerBoundaryPortV1 {
  if (options.workerBoundary !== undefined) return options.workerBoundary;
  const dependencies: WorkerBoundaryDependenciesV1 | undefined =
    options.workerAttempts !== undefined &&
    options.workerAuthenticator !== undefined &&
    options.workerAttemptAuthority !== undefined &&
    options.workerObjectGrantAuthority !== undefined &&
    options.workerCompletionTransaction !== undefined
      ? {
          attempts: options.workerAttempts,
          ...((options.workerAssignment ??
            ('assign' in options.workerAttempts
              ? (options.workerAttempts as WorkerAttemptMutationPortV1 & WorkerAssignmentPortV1)
              : undefined)) === undefined
            ? {}
            : {
                assignment:
                  options.workerAssignment ??
                  (options.workerAttempts as WorkerAttemptMutationPortV1 & WorkerAssignmentPortV1),
              }),
          authenticator: options.workerAuthenticator,
          authority: options.workerAttemptAuthority,
          grants: options.workerObjectGrantAuthority,
          completion: options.workerCompletionTransaction,
          ...(options.workerWorkloadEnvelope === undefined
            ? {}
            : { workloadEnvelope: options.workerWorkloadEnvelope }),
          ...(options.workerResultPreparation === undefined
            ? {}
            : { preparation: options.workerResultPreparation }),
          ...(options.workerResultWriteCapabilities === undefined
            ? {}
            : { resultCapabilities: options.workerResultWriteCapabilities }),
          ...(options.workerResultFinalization === undefined
            ? {}
            : { finalization: options.workerResultFinalization }),
          ...(options.workerResultAttestations === undefined
            ? {}
            : { attestations: options.workerResultAttestations }),
          ...(options.workerNow === undefined ? {} : { now: options.workerNow }),
        }
      : undefined;
  return dependencies === undefined
    ? new UnavailableWorkerBoundary()
    : new WorkerBoundary(dependencies);
}

@Module({})
export class JraWorkerModule {
  public static register(options: JraWorkerModuleOptions = {}): DynamicModule {
    const boundary = composeBoundary(options);
    return {
      module: JraWorkerModule,
      controllers: [WorkerController],
      providers: [
        { provide: WORKER_BOUNDARY, useValue: boundary },
        {
          provide: WORKER_AUTHENTICATOR_PORT,
          useValue: options.workerAuthenticator,
        },
        {
          provide: WORKER_ATTEMPT_AUTHORITY_PORT,
          useValue: options.workerAttemptAuthority,
        },
        {
          provide: WORKER_OBJECT_GRANT_AUTHORITY_PORT,
          useValue: options.workerObjectGrantAuthority,
        },
        {
          provide: WORKER_COMPLETION_TRANSACTION_PORT,
          useValue: options.workerCompletionTransaction,
        },
        {
          provide: WORKER_RESULT_PREPARATION_PORT,
          useValue: options.workerResultPreparation,
        },
        {
          provide: WORKER_RESULT_WRITE_CAPABILITY_AUTHORITY_PORT,
          useValue: options.workerResultWriteCapabilities,
        },
        {
          provide: WORKER_RESULT_FINALIZATION_PORT,
          useValue: options.workerResultFinalization,
        },
        {
          provide: WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
          useValue: options.workerResultAttestations,
        },
        {
          provide: WORKER_VERIFIED_RESULT_MANIFEST_PORT,
          useValue: options.workerVerifiedResultManifests,
        },
      ],
      exports: [WORKER_BOUNDARY, WORKER_VERIFIED_RESULT_MANIFEST_PORT],
    };
  }
}
