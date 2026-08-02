import { type DynamicModule, Module } from '@nestjs/common';

import { InboxController } from './api/inbox.controller.js';
import { InMemoryArtifactIntakeRepositoryAdapter } from './adapter/in-memory-artifact-intake-repository.adapter.js';
import {
  ARTIFACT_INTAKE_REPOSITORY_PORT,
  type ArtifactIntakeRepositoryPortV1,
} from './application/artifact-intake-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface IaeModuleOptions {
  readonly artifactIntakeRepository?: ArtifactIntakeRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class IaeModule {
  public static register(options: IaeModuleOptions = {}): DynamicModule {
    return {
      module: IaeModule,
      controllers: [InboxController],
      providers: [
        {
          provide: ARTIFACT_INTAKE_REPOSITORY_PORT,
          useValue: options.artifactIntakeRepository ?? new InMemoryArtifactIntakeRepositoryAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [ARTIFACT_INTAKE_REPOSITORY_PORT],
    };
  }
}
