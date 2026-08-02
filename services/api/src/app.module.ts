import { type DynamicModule, Module } from '@nestjs/common';

import { IamModule, type IamModuleOptions } from './features/iam/iam.module.js';
import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';
import { IaeModule, type IaeModuleOptions } from './features/iae/iae.module.js';
import { DsmModule, type DsmModuleOptions } from './features/dsm/dsm.module.js';
import { DsoModule, type DsoModuleOptions } from './features/dso/dso.module.js';
import { AudModule, type AudModuleOptions } from './features/aud/aud.module.js';
import { BuaModule, type BuaModuleOptions } from './features/bua/bua.module.js';

export type AppModuleOptions = SystemModuleOptions &
  IamModuleOptions &
  IaeModuleOptions &
  DsmModuleOptions &
  DsoModuleOptions &
  AudModuleOptions &
  BuaModuleOptions;

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
        AudModule.register(options),
        BuaModule.register(options),
      ],
    };
  }
}
