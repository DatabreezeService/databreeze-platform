import { Module, type DynamicModule } from '@nestjs/common';
import { MobileController } from './api/mobile.controller.js';
import { InMemoryMobileRepositoryAdapter } from './adapter/in-memory-mobile-repository.adapter.js';
import { PrismaMobileRepositoryAdapter } from './adapter/prisma-mobile-repository.adapter.js';
import { MOBILE_REPOSITORY_PORT } from './application/mobile-repository.port.js';
import type { MobileDatabaseClientV1, MobileRepositoryPortV1 } from './application/mobile-repository.port.js';
import { REQUEST_TENANT_CONTEXT, UnavailableRequestTenantContextAdapter } from '../../platform/http/request-tenant-context.port.js';
import type { RequestTenantContextPortV1 } from '../../platform/http/request-tenant-context.port.js';

export interface MobileModuleOptions {
  readonly mobileDatabase?: MobileDatabaseClientV1;
  readonly mobileRepository?: MobileRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly allowInMemoryAdapters?: boolean;
}

@Module({})
export class MobileModule {
  public static register(options: MobileModuleOptions = {}): DynamicModule {
    const repository = options.mobileRepository ?? (options.mobileDatabase ? new PrismaMobileRepositoryAdapter(options.mobileDatabase) : new InMemoryMobileRepositoryAdapter());
    if (options.allowInMemoryAdapters !== true && options.mobileDatabase === undefined && options.mobileRepository === undefined) throw new Error('MOBILE_DATABASE_REQUIRED');
    return {
      module: MobileModule,
      controllers: [MobileController],
      providers: [
        { provide: MOBILE_REPOSITORY_PORT, useValue: repository },
        { provide: REQUEST_TENANT_CONTEXT, useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter() },
      ],
      exports: [MOBILE_REPOSITORY_PORT],
    };
  }
}
