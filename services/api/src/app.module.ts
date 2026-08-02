import { type DynamicModule, Module } from '@nestjs/common';

import { IamModule, type IamModuleOptions } from './features/iam/iam.module.js';
import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';
import { IaeModule, type IaeModuleOptions } from './features/iae/iae.module.js';
import { DsmModule, type DsmModuleOptions } from './features/dsm/dsm.module.js';
import { DsoModule, type DsoModuleOptions } from './features/dso/dso.module.js';
import { AudModule, type AudModuleOptions } from './features/aud/aud.module.js';
import { BuaModule, type BuaModuleOptions } from './features/bua/bua.module.js';
import { SaModule, type SaModuleOptions } from './features/sa/sa.module.js';
import { SessionRequestTenantContextAdapter } from './platform/http/session-tenant-context.adapter.js';

export type AppModuleOptions = SystemModuleOptions &
  IamModuleOptions &
  IaeModuleOptions &
  DsmModuleOptions &
  DsoModuleOptions &
  AudModuleOptions &
  BuaModuleOptions &
  SaModuleOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const sessions = options.sessions;
    const requestTenantContext =
      options.requestTenantContext ??
      (typeof sessions?.findPrincipalByAccessToken === 'function'
        ? new SessionRequestTenantContextAdapter({
            findPrincipalByAccessToken: sessions.findPrincipalByAccessToken.bind(sessions),
          })
        : undefined);
    const composedOptions =
      requestTenantContext === undefined ? options : { ...options, requestTenantContext };
    return {
      module: AppModule,
      imports: [
        SystemModule.register(composedOptions),
        IamModule.register(composedOptions),
        IaeModule.register(composedOptions),
        DsmModule.register(composedOptions),
        DsoModule.register(composedOptions),
        AudModule.register(composedOptions),
        BuaModule.register(composedOptions),
        SaModule.register(composedOptions),
      ],
    };
  }
}
