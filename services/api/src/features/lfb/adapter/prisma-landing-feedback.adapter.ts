import { randomUUID } from 'node:crypto';

import type {
  LandingFeedbackCategoryV1,
  LandingFeedbackExperienceV1,
  LandingFeedbackIntakePortV1,
  LandingFeedbackIntakeResultV1,
  LandingFeedbackListItemV1,
  LandingFeedbackListPortV1,
  LandingFeedbackRoleV1,
} from '../application/landing-feedback-intake.port.js';

interface LandingFeedbackRowV1 {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly organization: string | null;
  readonly role: string;
  readonly experience: string;
  readonly category: string;
  readonly rating: number;
  readonly message: string;
  readonly contactPermission: boolean;
  readonly createdAt: Date;
}

export interface LandingFeedbackDatabaseClientV1 {
  readonly landingFeedbackRecord: {
    create(input: {
      readonly data: {
        readonly id: string;
        readonly email: string;
        readonly name?: string;
        readonly organization?: string;
        readonly role: string;
        readonly experience: string;
        readonly category: string;
        readonly rating: number;
        readonly message: string;
        readonly contactPermission: boolean;
        readonly sourceIpHash?: string;
        readonly createdAt: Date;
      };
    }): Promise<LandingFeedbackRowV1>;
    count(): Promise<number>;
    findMany(input: {
      readonly orderBy: { readonly createdAt: 'desc' };
      readonly take: number;
    }): Promise<readonly LandingFeedbackRowV1[]>;
  };
}

function asRole(value: string): LandingFeedbackRoleV1 | undefined {
  return (['owner', 'analyst', 'accounting', 'operations', 'technology', 'other'] as const).find(
    (candidate) => candidate === value,
  );
}

function asExperience(value: string): LandingFeedbackExperienceV1 | undefined {
  return (['exploring', 'trial', 'active'] as const).find((candidate) => candidate === value);
}

function asCategory(value: string): LandingFeedbackCategoryV1 | undefined {
  return (['product', 'feature', 'data-trust', 'design', 'performance', 'other'] as const).find(
    (candidate) => candidate === value,
  );
}

function asListItem(row: LandingFeedbackRowV1): LandingFeedbackListItemV1 | undefined {
  const role = asRole(row.role);
  const experience = asExperience(row.experience);
  const category = asCategory(row.category);
  if (role === undefined || experience === undefined || category === undefined) return undefined;
  return Object.freeze({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    ...(row.name === null ? {} : { name: row.name }),
    ...(row.organization === null ? {} : { organization: row.organization }),
    role,
    experience,
    category,
    rating: row.rating,
    message: row.message,
    contactPermission: row.contactPermission,
  });
}

/** WEB-026/WEB-027: lfb-owned persistence adapter over the landing_feedbacks projection. */
export class PrismaLandingFeedbackAdapter
  implements LandingFeedbackIntakePortV1, LandingFeedbackListPortV1
{
  public constructor(private readonly database: LandingFeedbackDatabaseClientV1) {}

  public async capture(input: {
    readonly command: Parameters<LandingFeedbackIntakePortV1['capture']>[0]['command'];
    readonly sourceIpHash?: string;
    readonly receivedAt: string;
  }): Promise<LandingFeedbackIntakeResultV1> {
    const receivedAt = new Date(input.receivedAt);
    const row = await this.database.landingFeedbackRecord.create({
      data: {
        id: randomUUID(),
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
        ...(input.sourceIpHash === undefined ? {} : { sourceIpHash: input.sourceIpHash }),
        createdAt: receivedAt,
      },
    });
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({ referenceId: row.id, receivedAt: row.createdAt.toISOString() }),
    });
  }

  public async readRecent(
    limit: number,
  ): Promise<{ readonly total: number; readonly items: readonly LandingFeedbackListItemV1[] }> {
    const [total, rows] = await Promise.all([
      this.database.landingFeedbackRecord.count(),
      this.database.landingFeedbackRecord.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    ]);
    const items = rows
      .map((row) => asListItem(row))
      .filter((item): item is LandingFeedbackListItemV1 => item !== undefined);
    return Object.freeze({ total, items: Object.freeze(items) });
  }
}
