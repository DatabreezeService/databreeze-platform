import { type DynamicModule, Module } from '@nestjs/common';

import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';

@Module({})
export class AppModule {
  static register(options: SystemModuleOptions = {}): DynamicModule {
    return { module: AppModule, imports: [SystemModule.register(options)] };
  }
}
