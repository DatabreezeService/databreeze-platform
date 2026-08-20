import { type DynamicModule, Module } from '@nestjs/common';

import {
  LFB_FEEDBACK_ADMISSION_DIGEST,
  LFB_FEEDBACK_IP_ADMISSION,
  LFB_LANDING_FEEDBACK_SERVICE,
  type LandingFeedbackAdmissionDigestPortV1,
  type LandingFeedbackAdmissionPortV1,
  type LandingFeedbackIntakePortV1,
  type LandingFeedbackIntakeResultV1,
} from './application/landing-feedback-intake.port.js';
import { LandingFeedbackService } from './application/landing-feedback.service.js';
import type { LandingFeedbackDatabaseClientV1 } from './adapter/prisma-landing-feedback.adapter.js';
import { LandingFeedbackController } from './api/landing-feedback.controller.js';

class UnavailableLandingFeedbackIntake implements LandingFeedbackIntakePortV1 {
  public async capture(): Promise<LandingFeedbackIntakeResultV1> {
    await Promise.resolve();
    throw new Error('LANDING_FEEDBACK_INTAKE_UNAVAILABLE');
  }
}

export interface LfbModuleOptions {
  readonly landingFeedbackIntake?: LandingFeedbackIntakePortV1;
  readonly landingFeedbackIpAdmission?: LandingFeedbackAdmissionPortV1;
  readonly landingFeedbackAdmissionDigest?: LandingFeedbackAdmissionDigestPortV1;
  readonly landingFeedbackClock?: () => Date;
  /** LFB landing feedback persistence view over the shared Prisma client. */
  readonly landingFeedbackDatabase?: LandingFeedbackDatabaseClientV1;
}

/** WEB-026: public landing feedback intake feature module. */
@Module({})
export class LfbModule {
  public static register(options: LfbModuleOptions = {}): DynamicModule {
    const service = new LandingFeedbackService({
      intake: options.landingFeedbackIntake ?? new UnavailableLandingFeedbackIntake(),
      ...(options.landingFeedbackClock === undefined ? {} : { now: options.landingFeedbackClock }),
    });
    return {
      module: LfbModule,
      controllers: [LandingFeedbackController],
      providers: [
        { provide: LFB_LANDING_FEEDBACK_SERVICE, useValue: service },
        ...(options.landingFeedbackIpAdmission === undefined
          ? []
          : [{ provide: LFB_FEEDBACK_IP_ADMISSION, useValue: options.landingFeedbackIpAdmission }]),
        ...(options.landingFeedbackAdmissionDigest === undefined
          ? []
          : [
              {
                provide: LFB_FEEDBACK_ADMISSION_DIGEST,
                useValue: options.landingFeedbackAdmissionDigest,
              },
            ]),
      ],
    };
  }
}
