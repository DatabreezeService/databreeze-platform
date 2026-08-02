import { type DynamicModule, Module } from '@nestjs/common';

import { AuthenticationController } from './api/authentication.controller.js';
import { AuthenticationService } from './application/authentication.service.js';
import {
  AUTHENTICATION_USE_CASE,
  type CredentialLookupPortV1,
  type AuthenticationUseCaseV1,
  type SessionIssuerPortV1,
} from './application/authentication.port.js';
import type { PasswordCredentialService } from './application/password-credential.service.js';
import { UnavailableAuthenticationAdapter } from './adapter/unavailable-authentication.adapter.js';

export interface IamModuleOptions {
  readonly authentication?: AuthenticationUseCaseV1;
  readonly credentials?: CredentialLookupPortV1;
  readonly passwordCredentials?: PasswordCredentialService;
  readonly sessions?: SessionIssuerPortV1;
}

export function composeAuthenticationUseCase(options: IamModuleOptions): AuthenticationUseCaseV1 {
  if (options.authentication) return options.authentication;
  if (options.credentials && options.passwordCredentials && options.sessions) {
    return new AuthenticationService({
      credentials: options.credentials,
      passwordCredentials: options.passwordCredentials,
      sessions: options.sessions,
    });
  }
  return new UnavailableAuthenticationAdapter();
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
          useValue: composeAuthenticationUseCase(options),
        },
      ],
    };
  }
}
