import { type DynamicModule, Module } from '@nestjs/common';

import { AuthenticationController } from './api/authentication.controller.js';
import {
  AUTHENTICATION_USE_CASE,
  type AuthenticationUseCaseV1,
} from './application/authentication.port.js';
import { UnavailableAuthenticationAdapter } from './adapter/unavailable-authentication.adapter.js';

export interface IamModuleOptions {
  readonly authentication?: AuthenticationUseCaseV1;
}

@Module({})
export class IamModule {
  static register(options: IamModuleOptions = {}): DynamicModule {
    return {
      module: IamModule,
      controllers: [AuthenticationController],
      providers: [
        {
          provide: AUTHENTICATION_USE_CASE,
          useValue: options.authentication ?? new UnavailableAuthenticationAdapter(),
        },
      ],
    };
  }
}
