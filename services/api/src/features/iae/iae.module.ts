import { type DynamicModule, Module } from '@nestjs/common';

import { InboxController } from './api/inbox.controller.js';
import { EvidenceGrantController } from './api/evidence-grant.controller.js';
import { ArtifactReadController } from './api/artifact-read.controller.js';
import { ArtifactLineageController } from './api/artifact-lineage.controller.js';
import { ContentPlacementController } from './api/content-placement.controller.js';
import { ArtifactRetentionController } from './api/artifact-retention.controller.js';
import { ArtifactExportController } from './api/artifact-export.controller.js';
import { ArtifactUploadController } from './api/artifact-upload.controller.js';
import { ArtifactAdmissionController } from './api/artifact-admission.controller.js';
import { ProtectedDocumentUnlockController } from './api/protected-document-unlock.controller.js';
import {
  IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT,
  IAE_WORKER_REQUEST_AUTHENTICATOR_PORT,
  UnavailableIaeWorkerCapabilityReferenceResolverAdapter,
  UnavailableIaeWorkerRequestAuthenticatorAdapter,
  WorkerObjectTransferController,
  type IaeWorkerRequestAuthenticatorPortV1,
} from './worker/api/worker-object-transfer.controller.js';
import { InMemoryArtifactIntakeRepositoryAdapter } from './adapter/in-memory-artifact-intake-repository.adapter.js';
import {
  ARTIFACT_UPLOAD_ADMISSION_PORT,
  type ArtifactUploadAdmissionPortV1,
  UnavailableArtifactUploadAdmissionAdapter,
} from './application/artifact-upload-admission.port.js';
import {
  PrismaArtifactIntakeRepositoryAdapter,
  type ArtifactIntakeDatabaseClientV1,
} from './adapter/prisma-artifact-intake-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from './adapter/in-memory-artifact-repository.adapter.js';
import { InMemoryArtifactLineageRepositoryAdapter } from './adapter/in-memory-artifact-lineage-repository.adapter.js';
import {
  PrismaArtifactLineageRepositoryAdapter,
  type ArtifactLineageDatabaseClientV1,
} from './adapter/prisma-artifact-lineage-repository.adapter.js';
import { InMemoryArtifactRetentionRepositoryAdapter } from './adapter/in-memory-artifact-retention-repository.adapter.js';
import {
  PrismaArtifactRetentionRepositoryAdapter,
  type ArtifactRetentionDatabaseClientV1,
} from './adapter/prisma-artifact-retention-repository.adapter.js';
import { InMemoryArtifactExportRepositoryAdapter } from './adapter/in-memory-artifact-export-repository.adapter.js';
import {
  PrismaArtifactExportRepositoryAdapter,
  type ArtifactExportDatabaseClientV1,
} from './adapter/prisma-artifact-export-repository.adapter.js';
import { InMemoryArtifactUploadRepositoryAdapter } from './adapter/in-memory-artifact-upload-repository.adapter.js';
import { InMemoryArtifactUploadStorageAdapter } from './adapter/in-memory-artifact-upload-storage.adapter.js';
import { UnavailableArtifactUploadStorageAdapter } from './adapter/unavailable-artifact-upload-storage.adapter.js';
import { InMemoryProtectedDocumentSecretInputAdapter } from './adapter/in-memory-protected-document-secret-input.adapter.js';
import { InMemoryProtectedDocumentUnlockRepositoryAdapter } from './adapter/in-memory-protected-document-unlock-repository.adapter.js';
import {
  PrismaProtectedDocumentUnlockRepositoryAdapter,
  type ProtectedDocumentUnlockDatabaseClientV1,
} from './adapter/prisma-protected-document-unlock-repository.adapter.js';
import {
  PrismaArtifactUploadRepositoryAdapter,
  type ArtifactUploadDatabaseClientV1,
} from './adapter/prisma-artifact-upload-repository.adapter.js';
import {
  PrismaArtifactRepositoryAdapter,
  type ArtifactDatabaseClientV1,
} from './adapter/prisma-artifact-repository.adapter.js';
import { InMemoryEvidenceGrantRepositoryAdapter } from './adapter/in-memory-evidence-grant-repository.adapter.js';
import {
  PrismaEvidenceGrantRepositoryAdapter,
  type EvidenceGrantDatabaseClientV1,
} from './adapter/prisma-evidence-grant-repository.adapter.js';
import {
  ARTIFACT_INTAKE_REPOSITORY_PORT,
  type ArtifactIntakeRepositoryPortV1,
} from './application/artifact-intake-repository.port.js';
import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from './application/artifact-repository.port.js';
import {
  ARTIFACT_LINEAGE_REPOSITORY_PORT,
  type ArtifactLineageRepositoryPortV1,
} from './application/artifact-lineage-repository.port.js';
import {
  ARTIFACT_RETENTION_REPOSITORY_PORT,
  type ArtifactRetentionRepositoryPortV1,
} from './application/artifact-retention-repository.port.js';
import {
  ARTIFACT_EXPORT_REPOSITORY_PORT,
  type ArtifactExportRepositoryPortV1,
} from './application/artifact-export-repository.port.js';
import {
  ARTIFACT_UPLOAD_REPOSITORY_PORT,
  type ArtifactUploadRepositoryPortV1,
} from './application/artifact-upload-repository.port.js';
import {
  ARTIFACT_UPLOAD_STORAGE_PORT,
  type ArtifactUploadStoragePortV1,
} from './application/artifact-upload-storage.port.js';
import { ObjectStorageArtifactProcessingContentAdapter } from './adapter/object-storage-artifact-processing-content.adapter.js';
import {
  ARTIFACT_PROCESSING_CONTENT_PORT,
  type ArtifactProcessingContentPortV1,
} from './application/artifact-processing-content.port.js';
import {
  PROTECTED_DOCUMENT_SECRET_INPUT_PORT,
  type ProtectedDocumentSecretInputPortV1,
} from './application/protected-document-secret-input.port.js';
import {
  PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT,
  type ProtectedDocumentUnlockRepositoryPortV1,
} from './application/protected-document-unlock-repository.port.js';
import {
  EVIDENCE_GRANT_REPOSITORY_PORT,
  type EvidenceGrantRepositoryPortV1,
} from './application/evidence-grant-repository.port.js';
import {
  IAE_AUTHORIZATION_PORT,
  type IaeAuthorizationPortV1,
  UnavailableIaeAuthorizationAdapter,
} from './application/iae-authorization.port.js';
import {
  IAE_CLOUD_ORIGINAL_SIGNER_PORT,
  IAE_ORIGINAL_VIEW_PORT,
  IaeOriginalViewService,
  type CloudOriginalSignerPortV1,
} from './application/original-view.service.js';
import { UnavailableCloudOriginalSignerAdapter } from './adapter/cloud-original-signer.adapter.js';
import {
  IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
  IAE_WORKER_CAPABILITY_SIGNER_PORT,
  IAE_WORKER_CAPABILITY_VERIFIER_PORT,
  IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT,
  IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT,
  IAE_WORKER_SECURITY_EPOCH_PORT,
  UnavailableIaeWorkerCapabilitySignerAdapter,
  UnavailableIaeWorkerCapabilityVerifierAdapter,
  UnavailableIaeWorkerInputObjectResolverAdapter,
  UnavailableIaeWorkerOutputObjectResolverAdapter,
  UnavailableIaeWorkerSecurityEpochAdapter,
  type IaeWorkerCapabilityRepositoryPortV1,
  type IaeWorkerCapabilitySignerPortV1,
  type IaeWorkerCapabilityReferenceResolverPortV1,
  type IaeWorkerCapabilityVerifierPortV1,
  type IaeWorkerInputObjectResolverPortV1,
  type IaeWorkerOutputObjectResolverPortV1,
  type IaeWorkerSecurityEpochPortV1,
} from './application/worker-object-capability.port.js';
import {
  IAE_WORKER_OBJECT_BYTE_STORE_PORT,
  type IaeWorkerObjectByteStorePortV1,
} from './application/worker-object-transfer.port.js';
import { IaeWorkerObjectTransferService } from './application/worker-object-transfer.service.js';
import { UnavailableWorkerObjectByteStoreAdapter } from './adapter/unavailable-worker-object-byte-store.adapter.js';
import {
  IAE_WORKER_RESULT_WRITE_CAPABILITY_ISSUER_PORT,
  IaeWorkerResultWriteCapabilityService,
  type IaeWorkerResultWriteCapabilityIssuerPortV1,
} from './application/worker-result-write-capability.service.js';
import {
  IaeWorkerObjectCapabilityService,
  type IaeWorkerObjectCapabilityPortV1,
} from './application/worker-object-capability.service.js';
import {
  AuthorizedArtifactAccessService,
  IAE_AUTHORIZED_ARTIFACT_ACCESS_PORT,
} from './application/authorized-artifact-access.service.js';
import { InMemoryWorkerObjectCapabilityRepositoryAdapter } from './adapter/in-memory-worker-object-capability-repository.adapter.js';
import { UnavailableWorkerObjectCapabilityRepositoryAdapter } from './adapter/unavailable-worker-object-capability-repository.adapter.js';
import { HmacWorkerCapabilitySignerAdapter } from './adapter/hmac-worker-capability-signer.adapter.js';
import {
  PrismaWorkerObjectCapabilityRepositoryAdapter,
  type WorkerObjectCapabilityDatabaseClientV1,
} from './adapter/prisma-worker-object-capability-repository.adapter.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';
import type { WorkerResultFinalizationDatabaseClientV1 } from './adapter/prisma-worker-result-finalization.adapter.js';
import {
  IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
  IAE_WORKER_RESULT_FINALIZATION_PORT,
  UnavailableIaeWorkerResultAttestationResolverAdapter,
  UnavailableIaeWorkerResultFinalizationAdapter,
  type IaeWorkerResultAttestationResolverPortV1,
  type IaeWorkerResultFinalizationPortV1,
} from './application/worker-result-finalization.port.js';
import type { LocalWebIntakeDatabaseV1 } from './adapter/local-web-intake.adapter.js';
import type {
  IaeLocalWebIntakePortV1,
  LocalWebIntakeObjectStorePortV1,
} from './application/local-web-intake.port.js';

export interface IaeModuleOptions {
  readonly runtimeMode?: 'production' | 'test' | 'development';
  readonly artifactIntakeRepository?: ArtifactIntakeRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactIntakeDatabase?: ArtifactIntakeDatabaseClientV1;
  readonly artifactRepository?: ArtifactRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactDatabase?: ArtifactDatabaseClientV1;
  readonly artifactLineageRepository?: ArtifactLineageRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactLineageDatabase?: ArtifactLineageDatabaseClientV1;
  readonly artifactRetentionRepository?: ArtifactRetentionRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactRetentionDatabase?: ArtifactRetentionDatabaseClientV1;
  readonly artifactExportRepository?: ArtifactExportRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactExportDatabase?: ArtifactExportDatabaseClientV1;
  readonly artifactUploadRepository?: ArtifactUploadRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly artifactUploadDatabase?: ArtifactUploadDatabaseClientV1;
  readonly artifactUploadStorage?: ArtifactUploadStoragePortV1;
  readonly artifactUploadAdmission?: ArtifactUploadAdmissionPortV1;
  readonly artifactProcessingContent?: ArtifactProcessingContentPortV1;
  readonly protectedDocumentUnlockRepository?: ProtectedDocumentUnlockRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly protectedDocumentUnlockDatabase?: ProtectedDocumentUnlockDatabaseClientV1;
  readonly protectedDocumentSecretInput?: ProtectedDocumentSecretInputPortV1;
  readonly evidenceGrantRepository?: EvidenceGrantRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly evidenceGrantDatabase?: EvidenceGrantDatabaseClientV1;
  readonly iaeAuthorization?: IaeAuthorizationPortV1;
  readonly iaeOriginalViewPort?: import('./application/original-view.service.js').IaeOriginalViewPortV1;
  readonly cloudOriginalSigner?: CloudOriginalSignerPortV1;
  readonly workerCapabilityRepository?: IaeWorkerCapabilityRepositoryPortV1;
  readonly workerCapabilityDatabase?: WorkerObjectCapabilityDatabaseClientV1;
  readonly workerInputObjectResolver?: IaeWorkerInputObjectResolverPortV1;
  readonly workerOutputObjectResolver?: IaeWorkerOutputObjectResolverPortV1;
  readonly workerCapabilitySigner?: IaeWorkerCapabilitySignerPortV1;
  readonly workerCapabilityVerifier?: IaeWorkerCapabilityVerifierPortV1;
  readonly workerCapabilityReferenceResolver?: IaeWorkerCapabilityReferenceResolverPortV1;
  /** Secret-manager supplied key; absence deliberately leaves worker signing unavailable. */
  readonly workerCapabilitySigningSecret?: string;
  readonly workerSecurityEpoch?: IaeWorkerSecurityEpochPortV1;
  readonly workerRequestAuthenticator?: IaeWorkerRequestAuthenticatorPortV1;
  readonly workerObjectByteStore?: IaeWorkerObjectByteStorePortV1;
  readonly workerResultWriteCapabilityIssuer?: IaeWorkerResultWriteCapabilityIssuerPortV1;
  readonly iaeWorkerObjectCapability?: IaeWorkerObjectCapabilityPortV1;
  readonly iaeWorkerResultFinalization?: IaeWorkerResultFinalizationPortV1;
  readonly workerResultAttestations?: IaeWorkerResultAttestationResolverPortV1;
  readonly workerResultFinalizationDatabase?: WorkerResultFinalizationDatabaseClientV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly localWebIntakeDatabase?: LocalWebIntakeDatabaseV1;
  readonly localWebIntakeObjectStore?: LocalWebIntakeObjectStorePortV1;
  readonly localWebIntake?: IaeLocalWebIntakePortV1;
}

@Module({})
export class IaeModule {
  public static register(options: IaeModuleOptions = {}): DynamicModule {
    return {
      module: IaeModule,
      controllers: [
        InboxController,
        EvidenceGrantController,
        ArtifactReadController,
        ArtifactLineageController,
        ContentPlacementController,
        ArtifactRetentionController,
        ArtifactExportController,
        ArtifactUploadController,
        ArtifactAdmissionController,
        ProtectedDocumentUnlockController,
        WorkerObjectTransferController,
      ],
      providers: [
        {
          provide: ARTIFACT_UPLOAD_ADMISSION_PORT,
          useValue:
            options.artifactUploadAdmission ?? new UnavailableArtifactUploadAdmissionAdapter(),
        },
        {
          provide: ARTIFACT_INTAKE_REPOSITORY_PORT,
          useValue:
            options.artifactIntakeRepository ??
            (options.artifactIntakeDatabase === undefined
              ? new InMemoryArtifactIntakeRepositoryAdapter()
              : new PrismaArtifactIntakeRepositoryAdapter(options.artifactIntakeDatabase)),
        },
        {
          provide: ARTIFACT_REPOSITORY_PORT,
          useValue:
            options.artifactRepository ??
            (options.artifactDatabase === undefined
              ? new InMemoryArtifactRepositoryAdapter()
              : new PrismaArtifactRepositoryAdapter(options.artifactDatabase)),
        },
        {
          provide: ARTIFACT_LINEAGE_REPOSITORY_PORT,
          useValue:
            options.artifactLineageRepository ??
            (options.artifactLineageDatabase === undefined
              ? new InMemoryArtifactLineageRepositoryAdapter()
              : new PrismaArtifactLineageRepositoryAdapter(options.artifactLineageDatabase)),
        },
        {
          provide: ARTIFACT_RETENTION_REPOSITORY_PORT,
          useValue:
            options.artifactRetentionRepository ??
            (options.artifactRetentionDatabase === undefined
              ? new InMemoryArtifactRetentionRepositoryAdapter()
              : new PrismaArtifactRetentionRepositoryAdapter(options.artifactRetentionDatabase)),
        },
        {
          provide: ARTIFACT_EXPORT_REPOSITORY_PORT,
          useValue:
            options.artifactExportRepository ??
            (options.artifactExportDatabase === undefined
              ? new InMemoryArtifactExportRepositoryAdapter()
              : new PrismaArtifactExportRepositoryAdapter(options.artifactExportDatabase)),
        },
        {
          provide: ARTIFACT_UPLOAD_REPOSITORY_PORT,
          useValue:
            options.artifactUploadRepository ??
            (options.artifactUploadDatabase === undefined
              ? new InMemoryArtifactUploadRepositoryAdapter()
              : new PrismaArtifactUploadRepositoryAdapter(options.artifactUploadDatabase)),
        },
        {
          provide: ARTIFACT_UPLOAD_STORAGE_PORT,
          useValue:
            options.artifactUploadStorage ??
            (options.runtimeMode === 'production'
              ? new UnavailableArtifactUploadStorageAdapter()
              : new InMemoryArtifactUploadStorageAdapter()),
        },
        {
          provide: ARTIFACT_PROCESSING_CONTENT_PORT,
          useValue:
            options.artifactProcessingContent ??
            new ObjectStorageArtifactProcessingContentAdapter(),
        },
        {
          provide: PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT,
          useValue:
            options.protectedDocumentUnlockRepository ??
            (options.protectedDocumentUnlockDatabase === undefined
              ? new InMemoryProtectedDocumentUnlockRepositoryAdapter()
              : new PrismaProtectedDocumentUnlockRepositoryAdapter(
                  options.protectedDocumentUnlockDatabase,
                )),
        },
        {
          provide: PROTECTED_DOCUMENT_SECRET_INPUT_PORT,
          useValue:
            options.protectedDocumentSecretInput ??
            new InMemoryProtectedDocumentSecretInputAdapter(),
        },
        {
          provide: EVIDENCE_GRANT_REPOSITORY_PORT,
          useValue:
            options.evidenceGrantRepository ??
            (options.evidenceGrantDatabase === undefined
              ? new InMemoryEvidenceGrantRepositoryAdapter()
              : new PrismaEvidenceGrantRepositoryAdapter(options.evidenceGrantDatabase)),
        },
        {
          provide: IAE_AUTHORIZATION_PORT,
          useValue: options.iaeAuthorization ?? new UnavailableIaeAuthorizationAdapter(),
        },
        {
          provide: IAE_CLOUD_ORIGINAL_SIGNER_PORT,
          useValue: options.cloudOriginalSigner ?? new UnavailableCloudOriginalSignerAdapter(),
        },
        {
          provide: IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
          useValue:
            options.workerCapabilityRepository ??
            (options.workerCapabilityDatabase !== undefined
              ? new PrismaWorkerObjectCapabilityRepositoryAdapter(options.workerCapabilityDatabase)
              : options.runtimeMode === 'production'
                ? new UnavailableWorkerObjectCapabilityRepositoryAdapter()
                : new InMemoryWorkerObjectCapabilityRepositoryAdapter()),
        },
        {
          provide: IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT,
          useValue:
            options.workerInputObjectResolver ??
            new UnavailableIaeWorkerInputObjectResolverAdapter(),
        },
        {
          provide: IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT,
          useValue:
            options.workerOutputObjectResolver ??
            new UnavailableIaeWorkerOutputObjectResolverAdapter(),
        },
        {
          provide: IAE_WORKER_CAPABILITY_SIGNER_PORT,
          useValue:
            options.workerCapabilitySigner ??
            (options.workerCapabilitySigningSecret === undefined
              ? new UnavailableIaeWorkerCapabilitySignerAdapter()
              : new HmacWorkerCapabilitySignerAdapter(options.workerCapabilitySigningSecret)),
        },
        {
          provide: IAE_WORKER_CAPABILITY_VERIFIER_PORT,
          useValue:
            options.workerCapabilityVerifier ?? new UnavailableIaeWorkerCapabilityVerifierAdapter(),
        },
        {
          provide: IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT,
          useValue:
            options.workerCapabilityReferenceResolver ??
            new UnavailableIaeWorkerCapabilityReferenceResolverAdapter(),
        },
        {
          provide: IAE_WORKER_REQUEST_AUTHENTICATOR_PORT,
          useValue:
            options.workerRequestAuthenticator ??
            new UnavailableIaeWorkerRequestAuthenticatorAdapter(),
        },
        {
          provide: IAE_WORKER_OBJECT_BYTE_STORE_PORT,
          useValue: options.workerObjectByteStore ?? new UnavailableWorkerObjectByteStoreAdapter(),
        },
        {
          provide: IAE_WORKER_SECURITY_EPOCH_PORT,
          useValue: options.workerSecurityEpoch ?? new UnavailableIaeWorkerSecurityEpochAdapter(),
        },
        {
          provide: IAE_ORIGINAL_VIEW_PORT,
          useFactory: (
            artifacts: ArtifactRepositoryPortV1,
            authorization: IaeAuthorizationPortV1,
            signer: CloudOriginalSignerPortV1,
          ) =>
            options.iaeOriginalViewPort ??
            new IaeOriginalViewService(artifacts, authorization, signer),
          inject: [
            ARTIFACT_REPOSITORY_PORT,
            IAE_AUTHORIZATION_PORT,
            IAE_CLOUD_ORIGINAL_SIGNER_PORT,
          ],
        },
        {
          provide: AuthorizedArtifactAccessService,
          useFactory: (
            artifacts: ArtifactRepositoryPortV1,
            grants: EvidenceGrantRepositoryPortV1,
            retention: ArtifactRetentionRepositoryPortV1,
            authorization: IaeAuthorizationPortV1,
          ) => new AuthorizedArtifactAccessService(artifacts, grants, retention, authorization),
          inject: [
            ARTIFACT_REPOSITORY_PORT,
            EVIDENCE_GRANT_REPOSITORY_PORT,
            ARTIFACT_RETENTION_REPOSITORY_PORT,
            IAE_AUTHORIZATION_PORT,
          ],
        },
        {
          provide: IAE_AUTHORIZED_ARTIFACT_ACCESS_PORT,
          useExisting: AuthorizedArtifactAccessService,
        },
        {
          provide: IaeWorkerObjectCapabilityService,
          useFactory: (
            repository: IaeWorkerCapabilityRepositoryPortV1,
            inputResolver: IaeWorkerInputObjectResolverPortV1,
            outputResolver: IaeWorkerOutputObjectResolverPortV1,
            capabilitySigner: IaeWorkerCapabilitySignerPortV1,
            securityEpoch: IaeWorkerSecurityEpochPortV1,
          ) =>
            options.iaeWorkerObjectCapability ??
            new IaeWorkerObjectCapabilityService(
              repository,
              inputResolver,
              outputResolver,
              capabilitySigner,
              securityEpoch,
            ),
          inject: [
            IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
            IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT,
            IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT,
            IAE_WORKER_CAPABILITY_SIGNER_PORT,
            IAE_WORKER_SECURITY_EPOCH_PORT,
          ],
        },
        {
          provide: IAE_WORKER_RESULT_FINALIZATION_PORT,
          useValue:
            options.iaeWorkerResultFinalization ??
            new UnavailableIaeWorkerResultFinalizationAdapter(),
        },
        {
          provide: IaeWorkerObjectTransferService,
          useFactory: (
            repository: IaeWorkerCapabilityRepositoryPortV1,
            verifier: IaeWorkerCapabilityVerifierPortV1,
            securityEpoch: IaeWorkerSecurityEpochPortV1,
            objects: IaeWorkerObjectByteStorePortV1,
          ) => new IaeWorkerObjectTransferService(repository, verifier, securityEpoch, objects),
          inject: [
            IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
            IAE_WORKER_CAPABILITY_VERIFIER_PORT,
            IAE_WORKER_SECURITY_EPOCH_PORT,
            IAE_WORKER_OBJECT_BYTE_STORE_PORT,
          ],
        },
        {
          provide: IAE_WORKER_RESULT_WRITE_CAPABILITY_ISSUER_PORT,
          useFactory: (
            repository: IaeWorkerCapabilityRepositoryPortV1,
            signer: IaeWorkerCapabilitySignerPortV1,
            securityEpoch: IaeWorkerSecurityEpochPortV1,
          ) =>
            options.workerResultWriteCapabilityIssuer ??
            new IaeWorkerResultWriteCapabilityService(repository, signer, securityEpoch),
          inject: [
            IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
            IAE_WORKER_CAPABILITY_SIGNER_PORT,
            IAE_WORKER_SECURITY_EPOCH_PORT,
          ],
        },
        {
          provide: IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
          useValue:
            options.workerResultAttestations ??
            new UnavailableIaeWorkerResultAttestationResolverAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [
        ARTIFACT_INTAKE_REPOSITORY_PORT,
        ARTIFACT_REPOSITORY_PORT,
        ARTIFACT_LINEAGE_REPOSITORY_PORT,
        ARTIFACT_RETENTION_REPOSITORY_PORT,
        ARTIFACT_EXPORT_REPOSITORY_PORT,
        ARTIFACT_UPLOAD_REPOSITORY_PORT,
        ARTIFACT_UPLOAD_STORAGE_PORT,
        ARTIFACT_UPLOAD_ADMISSION_PORT,
        ARTIFACT_PROCESSING_CONTENT_PORT,
        PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT,
        PROTECTED_DOCUMENT_SECRET_INPUT_PORT,
        EVIDENCE_GRANT_REPOSITORY_PORT,
        IAE_AUTHORIZATION_PORT,
        IAE_CLOUD_ORIGINAL_SIGNER_PORT,
        IAE_ORIGINAL_VIEW_PORT,
        IAE_WORKER_CAPABILITY_REPOSITORY_PORT,
        IAE_WORKER_INPUT_OBJECT_RESOLVER_PORT,
        IAE_WORKER_OUTPUT_OBJECT_RESOLVER_PORT,
        IAE_WORKER_CAPABILITY_SIGNER_PORT,
        IAE_WORKER_CAPABILITY_VERIFIER_PORT,
        IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT,
        IAE_WORKER_OBJECT_BYTE_STORE_PORT,
        IAE_WORKER_SECURITY_EPOCH_PORT,
        IAE_AUTHORIZED_ARTIFACT_ACCESS_PORT,
        AuthorizedArtifactAccessService,
        IaeWorkerObjectCapabilityService,
        IAE_WORKER_RESULT_FINALIZATION_PORT,
        IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
        IAE_WORKER_RESULT_WRITE_CAPABILITY_ISSUER_PORT,
      ],
    };
  }
}
