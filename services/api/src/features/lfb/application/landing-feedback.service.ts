import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import type {
  LandingFeedbackCommandV1,
  LandingFeedbackIntakePortV1,
  LandingFeedbackReceiptV1,
} from './landing-feedback-intake.port.js';

export type LandingFeedbackProblemCodeV1 =
  | 'LANDING_FEEDBACK_COMMAND_INVALID'
  | 'LANDING_FEEDBACK_RATE_LIMITED'
  | 'LANDING_FEEDBACK_UNAVAILABLE';

export class LandingFeedbackProblemError extends Error {
  public constructor(readonly code: LandingFeedbackProblemCodeV1) {
    super(code);
    this.name = 'LandingFeedbackProblemError';
  }
}

export interface LandingFeedbackServiceOptionsV1 {
  readonly intake: LandingFeedbackIntakePortV1;
  readonly now?: () => Date;
}

/** WEB-026: validates and persists one anonymous landing feedback submission. */
export class LandingFeedbackService {
  private readonly now: () => Date;

  public constructor(private readonly options: LandingFeedbackServiceOptionsV1) {
    this.now = options.now ?? (() => new Date());
  }

  public async submit(
    command: LandingFeedbackCommandV1,
    sourceIpHash?: string,
  ): Promise<LandingFeedbackReceiptV1> {
    const normalizedEmail = normalizeEmailAddressV1(command.email);
    if (!normalizedEmail.accepted)
      throw new LandingFeedbackProblemError('LANDING_FEEDBACK_COMMAND_INVALID');
    const name = command.name?.trim();
    const organization = command.organization?.trim();

    const receivedAt = this.now().toISOString();
    let result;
    try {
      result = await this.options.intake.capture({
        command: {
          email: normalizedEmail.value,
          ...(name === undefined || name.length === 0 ? {} : { name }),
          ...(organization === undefined || organization.length === 0 ? {} : { organization }),
          role: command.role,
          experience: command.experience,
          category: command.category,
          rating: command.rating,
          message: command.message,
          contactPermission: command.contactPermission,
        },
        ...(sourceIpHash === undefined ? {} : { sourceIpHash }),
        receivedAt,
      });
    } catch {
      throw new LandingFeedbackProblemError('LANDING_FEEDBACK_UNAVAILABLE');
    }
    if (!result.accepted) throw new LandingFeedbackProblemError('LANDING_FEEDBACK_UNAVAILABLE');
    return result.value;
  }
}
