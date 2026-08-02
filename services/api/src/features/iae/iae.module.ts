import { type DynamicModule, Module } from '@nestjs/common';

import { InboxController } from './api/inbox.controller.js';
import { EvidenceGrantController } from './api/evidence-grant.controller.js';
import { InMemoryArtifactIntakeRepositoryAdapter } from './adapter/in-memory-artifact-intake-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from './adapter/in-memory-artifact-repository.adapter.js';
import { InMemoryEvidenceGrantRepositoryAdapter } from './adapter/in-memory-evidence-grant-repository.adapter.js';
import {
  ARTIFACT_INTAKE_REPOSITORY_PORT,
  type ArtifactIntakeRepositoryPortV1,
} from './application/artifact-intake-repository.port.js';
import { ARTIFACT_REPOSITORY_PORT, type ArtifactRepositoryPortV1 } from './application/artifact-repository.port.js';
import { EVIDENCE_GRANT_REPOSITORY_PORT, type EvidenceGrantRepositoryPortV1 } from './application/evidence-grant-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface IaeModuleOptions {
  readonly artifactIntakeRepository?: ArtifactIntakeRepositoryPortV1;
  readonly artifactRepository?: ArtifactRepositoryPortV1;
  readonly evidenceGrantRepository?: EvidenceGrantRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class IaeModule {
  public static register(options: IaeModuleOptions = {}): DynamicModule {
    return {
      module: IaeModule,
      controllers: [InboxController, EvidenceGrantController],
      providers: [
        {
          provide: ARTIFACT_INTAKE_REPOSITORY_PORT,
          useValue: options.artifactIntakeRepository ?? new InMemoryArtifactIntakeRepositoryAdapter(),
        },
        {
          provide: ARTIFACT_REPOSITORY_PORT,
          useValue: options.artifactRepository ?? new InMemoryArtifactRepositoryAdapter(),
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
      exports: [ARTIFACT_INTAKE_REPOSITORY_PORT, ARTIFACT_REPOSITORY_PORT, EVIDENCE_GRANT_REPOSITORY_PORT],
    };
  }
}
