import { type DynamicModule, Module } from '@nestjs/common';

import { InMemoryEntitlementRepositoryAdapter } from './adapter/in-memory-entitlement-repository.adapter.js';
import {
  PrismaEntitlementRepositoryAdapter,
  type EntitlementDatabaseClientV1,
} from './adapter/prisma-entitlement-repository.adapter.js';
import { EntitlementAdmissionService } from './application/entitlement-admission.service.js';
import {
  ENTITLEMENT_REPOSITORY_PORT,
  type EntitlementRepositoryPortV1,
} from './application/entitlement-repository.port.js';

export const ENTITLEMENT_ADMISSION_SERVICE = Symbol('ENTITLEMENT_ADMISSION_SERVICE');

export interface BuaModuleOptions {
  readonly entitlementRepository?: EntitlementRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly entitlementDatabase?: EntitlementDatabaseClientV1;
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
    return {
      module: BuaModule,
      providers: [
        { provide: ENTITLEMENT_REPOSITORY_PORT, useValue: repository },
        { provide: ENTITLEMENT_ADMISSION_SERVICE, useValue: service },
      ],
      exports: [ENTITLEMENT_REPOSITORY_PORT, ENTITLEMENT_ADMISSION_SERVICE],
    };
  }
}
