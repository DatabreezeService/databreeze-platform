import { timingSafeEqual } from 'node:crypto';
import { type DynamicModule, Module } from '@nestjs/common';

import { AuthenticationController } from './api/authentication.controller.js';
import { MfaController } from './api/mfa.controller.js';
import { IamHierarchyController } from './api/hierarchy.controller.js';
import { IamMembershipController } from './api/membership.controller.js';
import { IamBootstrapController } from './api/bootstrap.controller.js';
import { AuthenticationService } from './application/authentication.service.js';
import {
  AUTHENTICATION_USE_CASE,
  CREDENTIAL_LOOKUP_PORT,
  type CredentialLookupPortV1,
  type AuthenticationUseCaseV1,
} from './application/authentication.port.js';
import {
  SESSION_LIFECYCLE_PORT,
  type SessionLifecyclePortV1,
} from './application/session-lifecycle.port.js';
import {
  IDENTITY_BOOTSTRAP_REPOSITORY_PORT,
  type IdentityBootstrapRepositoryPortV1,
} from './application/identity-bootstrap-repository.port.js';
import {
  IDENTITY_BOOTSTRAP_SERVICE,
  IdentityBootstrapService,
} from './application/identity-bootstrap.service.js';
import {
  MFA_REPOSITORY_PORT,
  type MfaRepositoryPortV1,
} from './application/mfa-repository.port.js';
import {
  MFA_SERVICE,
  MfaService,
  UnavailableMfaFactorProofVerifier,
  type MfaFactorProofVerifierV1,
} from './application/mfa.service.js';
import {
  IAM_REPOSITORY_PORT,
  type IamRepositoryPortV1,
} from './application/iam-repository.port.js';
import {
  IAM_HIERARCHY_REPOSITORY,
  type IamHierarchyRepositoryPortV1,
} from './application/hierarchy-repository.port.js';
import { IAM_HIERARCHY_SERVICE, IamHierarchyService } from './application/hierarchy.service.js';
import { IAM_MEMBERSHIP_SERVICE, IamMembershipService } from './application/membership.service.js';
import {
  IAM_INVITATION_SERVICE,
  IamInvitationService,
  type IamInvitationClockV1,
  type IamInvitationDeliveryPortV1,
  type IamInvitationDigestPortV1,
  type IamInvitationIdGeneratorV1,
  type IamPrincipalEmailLookupPortV1,
  type IamInvitationTokenGeneratorV1,
} from './application/invitation.service.js';
import {
  IAM_INVITATION_REPOSITORY_PORT,
  type IamInvitationRepositoryPortV1,
} from './application/invitation-repository.port.js';
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
import {
  PrismaMfaRepositoryAdapter,
  type MfaDatabaseClientV1,
} from './adapter/prisma-mfa-repository.adapter.js';
import {
  PrismaIamRepositoryAdapter,
  type IamDatabaseClientV1,
} from './adapter/prisma-iam-repository.adapter.js';
import {
  PrismaIamInvitationRepositoryAdapter,
  type IamInvitationDatabaseClientV1,
} from './adapter/prisma-iam-invitation-repository.adapter.js';
import {
  HmacSha256IamInvitationDigestAdapter,
  randomIamInvitationIdV1,
  randomIamInvitationTokenV1,
  type IamInvitationDigestKeyV1,
} from './adapter/iam-invitation-crypto.adapter.js';
import { InMemoryIamHierarchyRepositoryAdapter } from './adapter/in-memory-iam-hierarchy-repository.adapter.js';
import {
  PrismaIamHierarchyRepositoryAdapter,
  type IamHierarchyDatabaseClientV1,
} from './adapter/prisma-iam-hierarchy-repository.adapter.js';
import { DeviceIdentityController } from './api/device-identity.controller.js';
import { IamInvitationController } from './api/invitation.controller.js';
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
  readonly sessions?: SessionLifecyclePortV1;
  readonly sessionDatabase?: SessionLifecycleDatabaseClientV1;
  readonly identityBootstrapRepository?: IdentityBootstrapRepositoryPortV1;
  readonly identityBootstrapDatabase?: IdentityBootstrapDatabaseClientV1;
  readonly identityBootstrapService?: IdentityBootstrapService;
  readonly mfaRepository?: MfaRepositoryPortV1;
  readonly mfaDatabase?: MfaDatabaseClientV1;
  readonly mfaService?: MfaService;
  readonly mfaFactorProofVerifier?: MfaFactorProofVerifierV1;
  readonly mfaClock?: () => Date;
  readonly recoveryCodeMatcher?: {
    matches(presentedDigest: string, storedDigest: string): boolean;
  };
  readonly iamRepository?: IamRepositoryPortV1;
  readonly iamDatabase?: IamDatabaseClientV1;
  readonly hierarchyRepository?: IamHierarchyRepositoryPortV1;
  readonly hierarchyDatabase?: IamHierarchyDatabaseClientV1;
  readonly hierarchyService?: IamHierarchyService;
  readonly membershipService?: IamMembershipService;
  readonly invitationRepository?: IamInvitationRepositoryPortV1;
  readonly invitationDatabase?: IamInvitationDatabaseClientV1;
  readonly invitationService?: IamInvitationService;
  readonly invitationPrincipalEmails?: IamPrincipalEmailLookupPortV1;
  readonly invitationDelivery?: IamInvitationDeliveryPortV1;
  readonly invitationDigest?: IamInvitationDigestPortV1;
  readonly invitationDigestKey?: IamInvitationDigestKeyV1;
  readonly invitationIdGenerator?: IamInvitationIdGeneratorV1;
  readonly invitationTokenGenerator?: IamInvitationTokenGeneratorV1;
  readonly invitationClock?: IamInvitationClockV1;
  readonly deviceIdentityService?: DeviceIdentityService;
  readonly deviceIdentityRepository?: DeviceIdentityRepositoryPortV1;
  readonly deviceIdentityDatabase?: DeviceIdentityDatabaseClientV1;
  readonly deviceEnrollmentProofVerifier?: DeviceEnrollmentProofVerifierV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

/** Compare already-normalized recovery-code digests without data-dependent byte comparisons. */
export function constantTimeRecoveryCodeMatchV1(
  presentedDigest: string,
  storedDigest: string,
): boolean {
  const presented = Buffer.from(presentedDigest, 'utf8');
  const stored = Buffer.from(storedDigest, 'utf8');
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
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
    const identityBootstrapService =
      options.identityBootstrapService ??
      (identityBootstrapRepository === undefined
        ? undefined
        : new IdentityBootstrapService(identityBootstrapRepository));
    const mfaRepository =
      options.mfaRepository ??
      (options.mfaDatabase === undefined
        ? undefined
        : new PrismaMfaRepositoryAdapter(options.mfaDatabase));
    const mfaService =
      options.mfaService ??
      (mfaRepository === undefined
        ? undefined
        : new MfaService(
            mfaRepository,
            options.recoveryCodeMatcher ?? {
              matches: constantTimeRecoveryCodeMatchV1,
            },
            options.mfaFactorProofVerifier ?? new UnavailableMfaFactorProofVerifier(),
            options.mfaClock,
          ));
    const iamRepository =
      options.iamRepository ??
      (options.iamDatabase === undefined
        ? undefined
        : new PrismaIamRepositoryAdapter(options.iamDatabase));
    const hierarchyRepository =
      options.hierarchyRepository ??
      (options.hierarchyDatabase === undefined
        ? new InMemoryIamHierarchyRepositoryAdapter()
        : new PrismaIamHierarchyRepositoryAdapter(options.hierarchyDatabase));
    const hierarchyService =
      options.hierarchyService ??
      new IamHierarchyService(hierarchyRepository, undefined, undefined, iamRepository);
    const membershipService =
      options.membershipService ??
      (iamRepository === undefined ? undefined : new IamMembershipService(iamRepository));
    const invitationRepository =
      options.invitationRepository ??
      (options.invitationDatabase === undefined
        ? undefined
        : new PrismaIamInvitationRepositoryAdapter(options.invitationDatabase));
    const invitationDigest =
      options.invitationDigest ??
      (options.invitationDigestKey === undefined
        ? undefined
        : new HmacSha256IamInvitationDigestAdapter(options.invitationDigestKey));
    const invitationService =
      options.invitationService ??
      (invitationRepository &&
      options.invitationPrincipalEmails &&
      options.invitationDelivery &&
      invitationDigest
        ? new IamInvitationService(
            invitationRepository,
            options.invitationPrincipalEmails,
            options.invitationIdGenerator ?? randomIamInvitationIdV1,
            options.invitationTokenGenerator ?? randomIamInvitationTokenV1,
            invitationDigest,
            options.invitationDelivery,
            options.invitationClock,
          )
        : undefined);
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
    const exports = [
      DEVICE_IDENTITY_REPOSITORY_PORT,
      DEVICE_IDENTITY_SERVICE,
      IAM_HIERARCHY_REPOSITORY,
      IAM_HIERARCHY_SERVICE,
    ];
    if (credentials) exports.unshift(CREDENTIAL_LOOKUP_PORT);
    if (sessions) exports.unshift(SESSION_LIFECYCLE_PORT);
    if (identityBootstrapRepository) exports.unshift(IDENTITY_BOOTSTRAP_REPOSITORY_PORT);
    if (identityBootstrapService) exports.unshift(IDENTITY_BOOTSTRAP_SERVICE);
    if (mfaRepository) exports.unshift(MFA_REPOSITORY_PORT);
    if (mfaService) exports.unshift(MFA_SERVICE);
    if (iamRepository) exports.unshift(IAM_REPOSITORY_PORT);
    if (membershipService) exports.unshift(IAM_MEMBERSHIP_SERVICE);
    if (invitationRepository) exports.unshift(IAM_INVITATION_REPOSITORY_PORT);
    if (invitationService) exports.unshift(IAM_INVITATION_SERVICE);
    return {
      module: IamModule,
      controllers: [
        AuthenticationController,
        DeviceIdentityController,
        MfaController,
        IamHierarchyController,
        IamMembershipController,
        IamInvitationController,
        IamBootstrapController,
      ],
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
        ...(identityBootstrapService
          ? [
              {
                provide: IDENTITY_BOOTSTRAP_SERVICE,
                useValue: identityBootstrapService,
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
        ...(mfaService
          ? [
              {
                provide: MFA_SERVICE,
                useValue: mfaService,
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
          provide: IAM_HIERARCHY_REPOSITORY,
          useValue: hierarchyRepository,
        },
        {
          provide: IAM_HIERARCHY_SERVICE,
          useValue: hierarchyService,
        },
        ...(membershipService
          ? [
              {
                provide: IAM_MEMBERSHIP_SERVICE,
                useValue: membershipService,
              },
            ]
          : []),
        ...(invitationRepository
          ? [
              {
                provide: IAM_INVITATION_REPOSITORY_PORT,
                useValue: invitationRepository,
              },
            ]
          : []),
        ...(invitationService
          ? [
              {
                provide: IAM_INVITATION_SERVICE,
                useValue: invitationService,
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
