import { type DynamicModule, Module } from '@nestjs/common';

import type {
  PlatformIdentityAnalyticsPortV1,
  PlatformOperatorAuthorityPortV1,
  PlatformOperatorGrantV1,
} from '../iam/application/platform-administration.port.js';
import type { PlatformBillingAnalyticsPortV1 } from '../bua/application/platform-billing-analytics.port.js';
import type { LandingFeedbackListPortV1 } from '../lfb/application/landing-feedback-intake.port.js';
import { type RequestTenantContextPortV1 } from '../../platform/http/request-tenant-context.port.js';
import {
  REQUEST_AUTHENTICATED_ACTOR,
  type RequestAuthenticatedActorPortV1,
  UnavailableRequestAuthenticatedActorAdapter,
} from '../../platform/http/request-authenticated-actor.port.js';
import {
  PLATFORM_ADMIN_SERVICE,
  PlatformAdminService,
} from './application/platform-admin.service.js';
import { PlatformAdminController } from './api/platform-admin.controller.js';

class UnavailablePlatformOperatorAuthority implements PlatformOperatorAuthorityPortV1 {
  public async resolve(userId: string): Promise<PlatformOperatorGrantV1 | undefined> {
    void userId;
    await Promise.resolve();
    throw new Error('PLATFORM_OPERATOR_AUTHORITY_UNAVAILABLE');
  }
}

class UnavailablePlatformIdentityAnalytics implements PlatformIdentityAnalyticsPortV1 {
  public async read(): Promise<never> {
    await Promise.resolve();
    throw new Error('PLATFORM_IDENTITY_ANALYTICS_UNAVAILABLE');
  }
}

class UnavailablePlatformBillingAnalytics implements PlatformBillingAnalyticsPortV1 {
  public async read(): Promise<never> {
    await Promise.resolve();
    throw new Error('PLATFORM_BILLING_ANALYTICS_UNAVAILABLE');
  }
}

class UnavailableLandingFeedbackList implements LandingFeedbackListPortV1 {
  public async readRecent(): Promise<never> {
    await Promise.resolve();
    throw new Error('PLATFORM_LANDING_FEEDBACKS_UNAVAILABLE');
  }
}

export interface PlatformAdminModuleOptions {
  readonly platformOperatorAuthority?: PlatformOperatorAuthorityPortV1;
  readonly platformIdentityAnalytics?: PlatformIdentityAnalyticsPortV1;
  readonly platformBillingAnalytics?: PlatformBillingAnalyticsPortV1;
  readonly platformFeedbacks?: LandingFeedbackListPortV1;
  readonly platformAdminClock?: () => Date;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly requestAuthenticatedActor?: RequestAuthenticatedActorPortV1;
}

@Module({})
export class PlatformAdminModule {
  public static register(options: PlatformAdminModuleOptions = {}): DynamicModule {
    const service = new PlatformAdminService({
      authority: options.platformOperatorAuthority ?? new UnavailablePlatformOperatorAuthority(),
      identities: options.platformIdentityAnalytics ?? new UnavailablePlatformIdentityAnalytics(),
      billing: options.platformBillingAnalytics ?? new UnavailablePlatformBillingAnalytics(),
      feedbacks: options.platformFeedbacks ?? new UnavailableLandingFeedbackList(),
      ...(options.platformAdminClock === undefined ? {} : { now: options.platformAdminClock }),
    });
    const requestActor =
      options.requestAuthenticatedActor ??
      (options.requestTenantContext === undefined
        ? new UnavailableRequestAuthenticatedActorAdapter()
        : {
            resolve: async (request: unknown) => {
              const context = await options.requestTenantContext!.resolve(request);
              return Object.freeze({
                sessionId: context.sessionId ?? 'tenant-session',
                actorId: context.actorId,
                scopeType: 'TENANT' as const,
                securityEpoch: context.authorizationEpoch,
                mfaRequired: context.mfaRequired ?? false,
                mfaReenrollmentRequired: context.mfaReenrollmentRequired,
              });
            },
          });
    return {
      module: PlatformAdminModule,
      controllers: [PlatformAdminController],
      providers: [
        { provide: PLATFORM_ADMIN_SERVICE, useValue: service },
        {
          provide: REQUEST_AUTHENTICATED_ACTOR,
          useValue: requestActor,
        },
      ],
    };
  }
}
