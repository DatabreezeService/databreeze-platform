import { type DynamicModule, Module } from '@nestjs/common';

import { InboxController } from './api/inbox.controller.js';
import { EvidenceGrantController } from './api/evidence-grant.controller.js';
import { ArtifactReadController } from './api/artifact-read.controller.js';
import { ArtifactLineageController } from './api/artifact-lineage.controller.js';
import { ContentPlacementController } from './api/content-placement.controller.js';
import { ArtifactRetentionController } from './api/artifact-retention.controller.js';
import { ArtifactExportController } from './api/artifact-export.controller.js';
import { ArtifactUploadController } from './api/artifact-upload.controller.js';
import { InMemoryArtifactIntakeRepositoryAdapter } from './adapter/in-memory-artifact-intake-repository.adapter.js';
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
  EVIDENCE_GRANT_REPOSITORY_PORT,
  type EvidenceGrantRepositoryPortV1,
} from './application/evidence-grant-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface IaeModuleOptions {
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
  readonly evidenceGrantRepository?: EvidenceGrantRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
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
      ],
      providers: [
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
          provide: EVIDENCE_GRANT_REPOSITORY_PORT,
          useValue: options.evidenceGrantRepository ?? new InMemoryEvidenceGrantRepositoryAdapter(),
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
        EVIDENCE_GRANT_REPOSITORY_PORT,
      ],
    };
  }
}
