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
import { DeviceIdentityController } from './api/device-identity.controller.js';
import { InMemoryDeviceIdentityRepositoryAdapter } from './adapter/in-memory-device-identity-repository.adapter.js';
import {
  PrismaDeviceIdentityRepositoryAdapter,
  type DeviceIdentityDatabaseClientV1,
} from './adapter/prisma-device-identity-repository.adapter.js';
import {
  DEVICE_IDENTITY_SERVICE,
  DeviceIdentityService,
  UnavailableDeviceEnrollmentProofVerifier,
  type DeviceEnrollmentProofVerifierV1,
} from './application/device-identity.service.js';
import {
  DEVICE_IDENTITY_REPOSITORY_PORT,
  type DeviceIdentityRepositoryPortV1,
} from './application/device-identity-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface IamModuleOptions {
  readonly authentication?: AuthenticationUseCaseV1;
  readonly credentials?: CredentialLookupPortV1;
  readonly passwordCredentials?: PasswordCredentialService;
  readonly sessions?: SessionIssuerPortV1;
  readonly deviceIdentityService?: DeviceIdentityService;
  readonly deviceIdentityRepository?: DeviceIdentityRepositoryPortV1;
  readonly deviceIdentityDatabase?: DeviceIdentityDatabaseClientV1;
  readonly deviceEnrollmentProofVerifier?: DeviceEnrollmentProofVerifierV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
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
    const deviceIdentityRepository =
      options.deviceIdentityRepository ??
      (options.deviceIdentityDatabase === undefined
        ? new InMemoryDeviceIdentityRepositoryAdapter()
        : new PrismaDeviceIdentityRepositoryAdapter(options.deviceIdentityDatabase));
    const deviceIdentityService =
      options.deviceIdentityService ??
      new DeviceIdentityService(
        deviceIdentityRepository,
        options.deviceEnrollmentProofVerifier ?? new UnavailableDeviceEnrollmentProofVerifier(),
      );
    return {
      module: IamModule,
      controllers: [AuthenticationController, DeviceIdentityController],
      providers: [
        {
          provide: AUTHENTICATION_USE_CASE,
          useValue: composeAuthenticationUseCase(options),
        },
        {
          provide: DEVICE_IDENTITY_REPOSITORY_PORT,
          useValue: deviceIdentityRepository,
        },
        {
          provide: DEVICE_IDENTITY_SERVICE,
          useValue: deviceIdentityService,
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [DEVICE_IDENTITY_REPOSITORY_PORT, DEVICE_IDENTITY_SERVICE],
    };
  }
}
