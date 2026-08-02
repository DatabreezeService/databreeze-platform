import { type DynamicModule, Module } from '@nestjs/common';

import { IamModule, type IamModuleOptions } from './features/iam/iam.module.js';
import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';
import { IaeModule, type IaeModuleOptions } from './features/iae/iae.module.js';
import { DsmModule, type DsmModuleOptions } from './features/dsm/dsm.module.js';
import { DsoModule, type DsoModuleOptions } from './features/dso/dso.module.js';

export type AppModuleOptions = SystemModuleOptions &
  IamModuleOptions &
  IaeModuleOptions &
  DsmModuleOptions &
  DsoModuleOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SystemModule.register(options),
        IamModule.register(options),
        IaeModule.register(options),
        DsmModule.register(options),
        DsoModule.register(options),
      ],
    };
  }
}
