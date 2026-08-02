import { type DynamicModule, Module } from '@nestjs/common';

import { DeviceSyncController } from './api/device-sync.controller.js';
import { InMemoryDeviceSyncRepositoryAdapter } from './adapter/in-memory-device-sync-repository.adapter.js';
import {
  PrismaDeviceSyncRepositoryAdapter,
  type DeviceSyncDatabaseClientV1,
} from './adapter/prisma-device-sync-repository.adapter.js';
import {
  PrismaDeviceAuthorizationRepositoryAdapter,
  type DeviceAuthorizationDatabaseClientV1,
} from './adapter/prisma-device-authorization-repository.adapter.js';
import { InMemoryDataModePolicyRepositoryAdapter } from './adapter/in-memory-data-mode-policy-repository.adapter.js';
import { DeviceSyncAuthorizationAdapter } from './adapter/device-sync-authorization.adapter.js';
import { InMemoryDeviceAuthorizationRepositoryAdapter } from './adapter/in-memory-device-authorization-repository.adapter.js';
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
  DEVICE_SYNC_CURSOR_SIGNER,
  UnavailableDeviceSyncCursorSigner,
} from './application/device-sync-cursor-signer.port.js';
import type { DeviceSyncCursorSignerV1 } from '@databreeze/domain/device-sync/v1';
import {
  DEVICE_SYNC_AUTHORIZATION,
  type DeviceSyncAuthorizationPortV1,
} from './application/device-sync-authorization.port.js';
import { DeviceAuthorizationService } from './application/device-authorization.service.js';
import {
  DEVICE_AUTHORIZATION_REPOSITORY_PORT,
  type DeviceAuthorizationRepositoryPortV1,
} from './application/device-authorization-repository.port.js';
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
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly deviceSyncDatabase?: DeviceSyncDatabaseClientV1;
  /** Production composition passes the same generated Prisma client for durable grants/snapshots. */
  readonly deviceAuthorizationDatabase?: DeviceAuthorizationDatabaseClientV1;
  readonly dataModePolicyRepository?: DataModePolicyRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly deviceSyncCursorSigner?: DeviceSyncCursorSignerV1;
  readonly deviceSyncAuthorization?: DeviceSyncAuthorizationPortV1;
  readonly deviceAuthorizationRepository?: DeviceAuthorizationRepositoryPortV1;
}

function useCase(
  repository: DeviceSyncRepositoryPortV1,
  policy: DeviceSyncPolicyPortV1,
  authorization: DeviceSyncAuthorizationPortV1,
): DeviceSyncUseCaseV1 {
  return new DeviceSyncService(repository, policy, authorization);
}

@Module({})
export class DsoModule {
  public static register(options: DsoModuleOptions = {}): DynamicModule {
    const policyRepository =
      options.dataModePolicyRepository ?? new InMemoryDataModePolicyRepositoryAdapter();
    const authorizationRepository =
      options.deviceAuthorizationRepository ??
      (options.deviceAuthorizationDatabase === undefined
        ? new InMemoryDeviceAuthorizationRepositoryAdapter()
        : new PrismaDeviceAuthorizationRepositoryAdapter(options.deviceAuthorizationDatabase));
    const authorizationService = new DeviceAuthorizationService(authorizationRepository);
    const authorization =
      options.deviceSyncAuthorization ??
      new DeviceSyncAuthorizationAdapter(authorizationService);
    return {
      module: DsoModule,
      controllers: [DeviceSyncController],
      providers: [
        {
          provide: DEVICE_AUTHORIZATION_REPOSITORY_PORT,
          useValue: authorizationRepository,
        },
        {
          provide: DEVICE_SYNC_REPOSITORY_PORT,
          useValue:
            options.deviceSyncRepository ??
            (options.deviceSyncDatabase === undefined
              ? new InMemoryDeviceSyncRepositoryAdapter()
              : new PrismaDeviceSyncRepositoryAdapter(options.deviceSyncDatabase)),
        },
        { provide: DATA_MODE_POLICY_REPOSITORY_PORT, useValue: policyRepository },
        { provide: DEVICE_SYNC_AUTHORIZATION, useValue: authorization },
        {
          provide: DEVICE_SYNC_CURSOR_SIGNER,
          useValue: options.deviceSyncCursorSigner ?? new UnavailableDeviceSyncCursorSigner(),
        },
        {
          provide: DEVICE_SYNC_USE_CASE,
          useFactory: (
            repository: DeviceSyncRepositoryPortV1,
            deviceAuthorization: DeviceSyncAuthorizationPortV1,
          ): DeviceSyncUseCaseV1 => useCase(repository, policyRepository, deviceAuthorization),
          inject: [DEVICE_SYNC_REPOSITORY_PORT, DEVICE_SYNC_AUTHORIZATION],
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
