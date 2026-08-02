import { type DynamicModule, Module } from '@nestjs/common';

import { IamModule, type IamModuleOptions } from './features/iam/iam.module.js';
import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';

export type AppModuleOptions = SystemModuleOptions & IamModuleOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [SystemModule.register(options), IamModule.register(options)],
    };
  }
}
