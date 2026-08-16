import { randomUUID } from 'node:crypto';

import type {
  LandingFeedbackIntakePortV1,
  LandingFeedbackIntakeResultV1,
  LandingFeedbackListItemV1,
  LandingFeedbackListPortV1,
} from '../application/landing-feedback-intake.port.js';

/** Deterministic in-memory lfb persistence for tests and local composition. */
export class InMemoryLandingFeedbackAdapter
  implements LandingFeedbackIntakePortV1, LandingFeedbackListPortV1
{
  private readonly rows: LandingFeedbackListItemV1[] = [];

  public constructor(seed: readonly LandingFeedbackListItemV1[] = []) {
    this.rows.push(...seed);
  }

  public async capture(input: {
    readonly command: Parameters<LandingFeedbackIntakePortV1['capture']>[0]['command'];
    readonly sourceIpHash?: string;
    readonly receivedAt: string;
  }): Promise<LandingFeedbackIntakeResultV1> {
    await Promise.resolve();
    const referenceId = randomUUID();
    this.rows.push(
      Object.freeze({
        id: referenceId,
        createdAt: input.receivedAt,
        email: input.command.email,
        ...(input.command.name === undefined ? {} : { name: input.command.name }),
        ...(input.command.organization === undefined
          ? {}
          : { organization: input.command.organization }),
        role: input.command.role,
        experience: input.command.experience,
        category: input.command.category,
        rating: input.command.rating,
        message: input.command.message,
        contactPermission: input.command.contactPermission,
      }),
    );
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({ referenceId, receivedAt: input.receivedAt }),
    });
  }

  public async readRecent(
    limit: number,
  ): Promise<{ readonly total: number; readonly items: readonly LandingFeedbackListItemV1[] }> {
    await Promise.resolve();
    const sorted = [...this.rows].sort((left, right) =>
      left.createdAt === right.createdAt ? 0 : left.createdAt < right.createdAt ? 1 : -1,
    );
    return Object.freeze({ total: this.rows.length, items: Object.freeze(sorted.slice(0, limit)) });
  }
}
