import { type DynamicModule, Module } from '@nestjs/common';

import { AuthenticationController } from './api/authentication.controller.js';
import { AuthenticationService } from './application/authentication.service.js';
import {
  AUTHENTICATION_USE_CASE,
  CREDENTIAL_LOOKUP_PORT,
  type CredentialLookupPortV1,
  type AuthenticationUseCaseV1,
  type SessionIssuerPortV1,
} from './application/authentication.port.js';
import { SESSION_LIFECYCLE_PORT } from './application/session-lifecycle.port.js';
import {
  IDENTITY_BOOTSTRAP_REPOSITORY_PORT,
  type IdentityBootstrapRepositoryPortV1,
} from './application/identity-bootstrap-repository.port.js';
import { MFA_REPOSITORY_PORT, type MfaRepositoryPortV1 } from './application/mfa-repository.port.js';
import { IAM_REPOSITORY_PORT, type IamRepositoryPortV1 } from './application/iam-repository.port.js';
import type { PasswordCredentialService } from './application/password-credential.service.js';
import { UnavailableAuthenticationAdapter } from './adapter/unavailable-authentication.adapter.js';
import {
  PrismaCredentialLookupAdapter,
  type CredentialLookupDatabaseClientV1,
} from './adapter/prisma-credential-lookup.adapter.js';
import {
  PrismaSessionLifecycleAdapter,
  type SessionLifecycleDatabaseClientV1,
} from './adapter/prisma-session-lifecycle.adapter.js';
import {
  PrismaIdentityBootstrapRepositoryAdapter,
  type IdentityBootstrapDatabaseClientV1,
} from './adapter/prisma-identity-bootstrap-repository.adapter.js';
import { PrismaMfaRepositoryAdapter, type MfaDatabaseClientV1 } from './adapter/prisma-mfa-repository.adapter.js';
import { PrismaIamRepositoryAdapter, type IamDatabaseClientV1 } from './adapter/prisma-iam-repository.adapter.js';
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
  readonly credentialDatabase?: CredentialLookupDatabaseClientV1;
  readonly passwordCredentials?: PasswordCredentialService;
  readonly sessions?: SessionIssuerPortV1;
  readonly sessionDatabase?: SessionLifecycleDatabaseClientV1;
  readonly identityBootstrapRepository?: IdentityBootstrapRepositoryPortV1;
  readonly identityBootstrapDatabase?: IdentityBootstrapDatabaseClientV1;
  readonly mfaRepository?: MfaRepositoryPortV1;
  readonly mfaDatabase?: MfaDatabaseClientV1;
  readonly iamRepository?: IamRepositoryPortV1;
  readonly iamDatabase?: IamDatabaseClientV1;
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
    const credentials =
      options.credentials ??
      (options.credentialDatabase === undefined
        ? undefined
        : new PrismaCredentialLookupAdapter(options.credentialDatabase));
    const sessions =
      options.sessions ??
      (options.sessionDatabase === undefined
        ? undefined
        : new PrismaSessionLifecycleAdapter(options.sessionDatabase));
    const identityBootstrapRepository =
      options.identityBootstrapRepository ??
      (options.identityBootstrapDatabase === undefined
        ? undefined
        : new PrismaIdentityBootstrapRepositoryAdapter(options.identityBootstrapDatabase));
    const mfaRepository =
      options.mfaRepository ??
      (options.mfaDatabase === undefined
        ? undefined
        : new PrismaMfaRepositoryAdapter(options.mfaDatabase));
    const iamRepository =
      options.iamRepository ??
      (options.iamDatabase === undefined
        ? undefined
        : new PrismaIamRepositoryAdapter(options.iamDatabase));
    const authentication =
      options.authentication ??
      (credentials && sessions
        ? composeAuthenticationUseCase({ ...options, credentials, sessions })
        : composeAuthenticationUseCase(options));
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
    const exports = [DEVICE_IDENTITY_REPOSITORY_PORT, DEVICE_IDENTITY_SERVICE];
    if (credentials) exports.unshift(CREDENTIAL_LOOKUP_PORT);
    if (sessions) exports.unshift(SESSION_LIFECYCLE_PORT);
    if (identityBootstrapRepository) exports.unshift(IDENTITY_BOOTSTRAP_REPOSITORY_PORT);
    if (mfaRepository) exports.unshift(MFA_REPOSITORY_PORT);
    if (iamRepository) exports.unshift(IAM_REPOSITORY_PORT);
    return {
      module: IamModule,
      controllers: [AuthenticationController, DeviceIdentityController],
      providers: [
        {
          provide: AUTHENTICATION_USE_CASE,
          useValue: authentication,
        },
        ...(credentials
          ? [
              {
                provide: CREDENTIAL_LOOKUP_PORT,
                useValue: credentials,
              },
            ]
          : []),
        ...(sessions
          ? [
              {
                provide: SESSION_LIFECYCLE_PORT,
                useValue: sessions,
              },
            ]
          : []),
        ...(identityBootstrapRepository
          ? [
              {
                provide: IDENTITY_BOOTSTRAP_REPOSITORY_PORT,
                useValue: identityBootstrapRepository,
              },
            ]
          : []),
        ...(mfaRepository
          ? [
              {
                provide: MFA_REPOSITORY_PORT,
                useValue: mfaRepository,
              },
            ]
          : []),
        ...(iamRepository
          ? [
              {
                provide: IAM_REPOSITORY_PORT,
                useValue: iamRepository,
              },
            ]
          : []),
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
      exports,
    };
  }
}
