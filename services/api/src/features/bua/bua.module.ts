import { type DynamicModule, Module } from '@nestjs/common';

import { InMemoryEntitlementRepositoryAdapter } from './adapter/in-memory-entitlement-repository.adapter.js';
import {
  PrismaEntitlementRepositoryAdapter,
  type EntitlementDatabaseClientV1,
} from './adapter/prisma-entitlement-repository.adapter.js';
import { EntitlementAdmissionService } from './application/entitlement-admission.service.js';
import {
  ENTITLEMENT_LEASE_SERVICE,
  EntitlementLeaseService,
  UnavailableEntitlementLeaseService,
  type EntitlementLeaseClockV1,
  type EntitlementLeaseIdGeneratorV1,
  type EntitlementLeaseService as EntitlementLeaseServicePortV1,
  type EntitlementLeaseSignerV1,
} from './application/entitlement-lease.service.js';
import {
  ENTITLEMENT_LEASE_REPOSITORY_PORT,
  type EntitlementLeaseRepositoryPortV1,
} from './application/entitlement-lease-repository.port.js';
import { InMemoryEntitlementLeaseRepositoryAdapter } from './adapter/in-memory-entitlement-lease-repository.adapter.js';
import {
  PrismaEntitlementLeaseRepositoryAdapter,
  type EntitlementLeaseDatabaseClientV1,
} from './adapter/prisma-entitlement-lease-repository.adapter.js';
import {
  ENTITLEMENT_REPOSITORY_PORT,
  type EntitlementRepositoryPortV1,
} from './application/entitlement-repository.port.js';
import { EntitlementController } from './api/entitlement.controller.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export const ENTITLEMENT_ADMISSION_SERVICE = Symbol('ENTITLEMENT_ADMISSION_SERVICE');

export interface BuaModuleOptions {
  readonly entitlementRepository?: EntitlementRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly entitlementDatabase?: EntitlementDatabaseClientV1;
  readonly entitlementLeaseRepository?: EntitlementLeaseRepositoryPortV1;
  readonly entitlementLeaseDatabase?: EntitlementLeaseDatabaseClientV1;
  readonly entitlementLeaseService?:
    | EntitlementLeaseServicePortV1
    | UnavailableEntitlementLeaseService;
  readonly entitlementLeaseSigner?: EntitlementLeaseSignerV1;
  readonly entitlementLeaseClock?: EntitlementLeaseClockV1;
  readonly entitlementLeaseIdGenerator?: EntitlementLeaseIdGeneratorV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class BuaModule {
  public static register(options: BuaModuleOptions = {}): DynamicModule {
    const repository =
      options.entitlementRepository ??
      (options.entitlementDatabase === undefined
        ? new InMemoryEntitlementRepositoryAdapter()
        : new PrismaEntitlementRepositoryAdapter(options.entitlementDatabase));
    const service = new EntitlementAdmissionService(repository);
    const leaseRepository =
      options.entitlementLeaseRepository ??
      (options.entitlementLeaseDatabase === undefined
        ? new InMemoryEntitlementLeaseRepositoryAdapter()
        : new PrismaEntitlementLeaseRepositoryAdapter(options.entitlementLeaseDatabase));
    const leaseService =
      options.entitlementLeaseService ??
      (options.entitlementLeaseSigner === undefined
        ? new UnavailableEntitlementLeaseService()
        : new EntitlementLeaseService(
            leaseRepository,
            repository,
            options.entitlementLeaseSigner,
            options.entitlementLeaseClock,
            options.entitlementLeaseIdGenerator,
          ));
    return {
      module: BuaModule,
      controllers: [EntitlementController],
      providers: [
        { provide: ENTITLEMENT_REPOSITORY_PORT, useValue: repository },
        { provide: ENTITLEMENT_ADMISSION_SERVICE, useValue: service },
        { provide: ENTITLEMENT_LEASE_REPOSITORY_PORT, useValue: leaseRepository },
        { provide: ENTITLEMENT_LEASE_SERVICE, useValue: leaseService },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [
        ENTITLEMENT_REPOSITORY_PORT,
        ENTITLEMENT_ADMISSION_SERVICE,
        ENTITLEMENT_LEASE_REPOSITORY_PORT,
        ENTITLEMENT_LEASE_SERVICE,
      ],
    };
  }
}
