import { type DynamicModule, Module } from '@nestjs/common';

import { DeviceSyncController } from './api/device-sync.controller.js';
import { InMemoryDeviceSyncRepositoryAdapter } from './adapter/in-memory-device-sync-repository.adapter.js';
import { InMemoryDataModePolicyRepositoryAdapter } from './adapter/in-memory-data-mode-policy-repository.adapter.js';
import {
  DEVICE_SYNC_REPOSITORY_PORT,
  type DeviceSyncRepositoryPortV1,
} from './application/device-sync-repository.port.js';
import {
  DeviceSyncService,
  type DeviceSyncPolicyPortV1,
} from './application/device-sync.service.js';
import {
  DEVICE_SYNC_USE_CASE,
  type DeviceSyncUseCaseV1,
} from './application/device-sync.use-case.js';
import {
  DATA_MODE_POLICY_REPOSITORY_PORT,
  type DataModePolicyRepositoryPortV1,
} from './application/data-mode-policy-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface DsoModuleOptions {
  readonly deviceSyncRepository?: DeviceSyncRepositoryPortV1;
  readonly dataModePolicyRepository?: DataModePolicyRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

function useCase(
  repository: DeviceSyncRepositoryPortV1,
  policy: DeviceSyncPolicyPortV1,
): DeviceSyncUseCaseV1 {
  return new DeviceSyncService(repository, policy);
}

@Module({})
export class DsoModule {
  public static register(options: DsoModuleOptions = {}): DynamicModule {
    const policyRepository =
      options.dataModePolicyRepository ?? new InMemoryDataModePolicyRepositoryAdapter();
    return {
      module: DsoModule,
      controllers: [DeviceSyncController],
      providers: [
        {
          provide: DEVICE_SYNC_REPOSITORY_PORT,
          useValue: options.deviceSyncRepository ?? new InMemoryDeviceSyncRepositoryAdapter(),
        },
        { provide: DATA_MODE_POLICY_REPOSITORY_PORT, useValue: policyRepository },
        {
          provide: DEVICE_SYNC_USE_CASE,
          useFactory: (repository: DeviceSyncRepositoryPortV1): DeviceSyncUseCaseV1 =>
            useCase(repository, policyRepository),
          inject: [DEVICE_SYNC_REPOSITORY_PORT],
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [DEVICE_SYNC_REPOSITORY_PORT, DEVICE_SYNC_USE_CASE],
    };
  }
}
