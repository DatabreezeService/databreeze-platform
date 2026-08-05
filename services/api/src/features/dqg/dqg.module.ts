import { type DynamicModule, Module } from '@nestjs/common';

import { InProcessDataQualityGuardValidationAdapter } from './adapter/in-process-data-quality-guard-validation.adapter.js';
import { DataQualityGuardValidationController } from './api/data-quality-guard-validation.controller.js';
import {
  DATA_QUALITY_GUARD_VALIDATION_PORT,
  type DataQualityGuardValidationPortV1,
} from './application/data-quality-guard-validation.port.js';
import { DataQualityGuardValidationService } from './application/data-quality-guard-validation.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface DqgModuleOptions {
  readonly dataQualityGuardValidationPort?: DataQualityGuardValidationPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class DqgModule {
  public static register(options: DqgModuleOptions = {}): DynamicModule {
    return {
      module: DqgModule,
      controllers: [DataQualityGuardValidationController],
      providers: [
        {
          provide: DATA_QUALITY_GUARD_VALIDATION_PORT,
          useValue:
            options.dataQualityGuardValidationPort ??
            new InProcessDataQualityGuardValidationAdapter(),
        },
        DataQualityGuardValidationService,
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [DATA_QUALITY_GUARD_VALIDATION_PORT],
    };
  }
}
