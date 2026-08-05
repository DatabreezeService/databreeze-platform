import { type DynamicModule, Module } from '@nestjs/common';

import {
  CLIENT_COMPATIBILITY_PORT,
  type ClientCompatibilityPort,
} from './application/client-compatibility.port.js';
import { ModuleCatalogService } from './application/module-catalog.service.js';
import { READINESS_PORT, type ReadinessPort } from './application/readiness.port.js';
import { SupportedClientCompatibilityService } from './application/supported-client-compatibility.service.js';
import { HealthController } from './api/health.controller.js';
import { SystemController } from './api/system.controller.js';
import { ProcessReadinessAdapter } from './adapter/process-readiness.adapter.js';

export interface SystemModuleOptions {
  readonly compatibilityPort?: ClientCompatibilityPort;
  readonly readinessPort?: ReadinessPort;
}

@Module({})
export class SystemModule {
  static register(options: SystemModuleOptions = {}): DynamicModule {
    return {
      module: SystemModule,
      controllers: [HealthController, SystemController],
      providers: [
        ModuleCatalogService,
        {
          provide: READINESS_PORT,
          useValue: options.readinessPort ?? new ProcessReadinessAdapter(),
        },
        {
          provide: CLIENT_COMPATIBILITY_PORT,
          useValue: options.compatibilityPort ?? new SupportedClientCompatibilityService(),
        },
      ],
    };
  }
}
