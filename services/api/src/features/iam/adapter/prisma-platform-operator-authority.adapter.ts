import type {
  PlatformOperatorAuthorityPortV1,
  PlatformOperatorGrantV1,
  PlatformOperatorRoleV1,
} from '../application/platform-administration.port.js';

interface PlatformOperatorRowV1 {
  readonly role: string;
  readonly status: string;
  readonly revision: number;
}

export interface PlatformOperatorDatabaseClientV1 {
  readonly platformOperatorRecord: {
    findUnique(input: {
      readonly where: { readonly userId: string };
      readonly select: {
        readonly role: true;
        readonly status: true;
        readonly revision: true;
      };
    }): Promise<PlatformOperatorRowV1 | null>;
  };
}

function isRole(value: string): value is PlatformOperatorRoleV1 {
  return value === 'PLATFORM_OWNER' || value === 'PLATFORM_SUPPORT';
}

/** IAM-026: every request reads the current assignment and fails closed. */
export class PrismaPlatformOperatorAuthorityAdapter implements PlatformOperatorAuthorityPortV1 {
  public constructor(private readonly database: PlatformOperatorDatabaseClientV1) {}

  public async resolve(userId: string): Promise<PlatformOperatorGrantV1 | undefined> {
    const row = await this.database.platformOperatorRecord.findUnique({
      where: { userId },
      select: { role: true, status: true, revision: true },
    });
    if (row === null || row.status !== 'ACTIVE' || !isRole(row.role) || row.revision < 1)
      return undefined;
    return Object.freeze({ role: row.role, revision: row.revision });
  }
}
