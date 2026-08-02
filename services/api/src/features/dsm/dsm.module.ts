import { type DynamicModule, Module } from '@nestjs/common';

import { GovernedDatasetController } from './api/governed-dataset.controller.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from './adapter/in-memory-governed-dataset-repository.adapter.js';
import {
  GOVERNED_DATASET_REPOSITORY_PORT,
  type GovernedDatasetRepositoryPortV1,
} from './application/governed-dataset-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface DsmModuleOptions {
  readonly governedDatasetRepository?: GovernedDatasetRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class DsmModule {
  public static register(options: DsmModuleOptions = {}): DynamicModule {
    return {
      module: DsmModule,
      controllers: [GovernedDatasetController],
      providers: [
        {
          provide: GOVERNED_DATASET_REPOSITORY_PORT,
          useValue: options.governedDatasetRepository ?? new InMemoryGovernedDatasetRepositoryAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
    };
  }
}
