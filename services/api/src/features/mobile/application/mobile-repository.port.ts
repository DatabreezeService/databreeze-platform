import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const MOBILE_REPOSITORY_PORT = Symbol('MOBILE_REPOSITORY_PORT');

export interface MobileTaskViewV1 {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: number;
  readonly taskType: string;
  readonly safeTitleKey: string;
  readonly evidenceAvailability: 'AVAILABLE' | 'RESTRICTED' | 'NONE';
  readonly permittedActions: readonly string[];
}

export interface MobileRepositoryPortV1 {
  listTasks(context: IamTenantContextV1): Promise<readonly MobileTaskViewV1[]>;
  resolveRouteToken(context: IamTenantContextV1, tokenDigest: string): Promise<string | undefined>;
  issueRouteToken(
    context: IamTenantContextV1,
    input: {
      readonly id: string;
      readonly tokenDigest: string;
      readonly route: string;
      readonly expiresAt: Date;
    },
  ): Promise<void>;
  registerPush(
    context: IamTenantContextV1,
    input: {
      readonly id: string;
      readonly platform: 'ANDROID';
      readonly providerTokenDigest: string;
      readonly installationIdHash: string;
      readonly now: Date;
    },
  ): Promise<void>;
  createReport(
    context: IamTenantContextV1,
    input: {
      readonly id: string;
      readonly reportType: string;
      readonly subjectId?: string;
      readonly payloadDigest: string;
    },
  ): Promise<void>;
  listReports(context: IamTenantContextV1): Promise<
    readonly {
      readonly reportId: string;
      readonly reportType: string;
      readonly status: string;
      readonly createdAt: string;
    }[]
  >;
}

export interface MobileDatabaseClientV1 {
  readonly mobileRouteTokenRecord: {
    create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
    findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<{
      readonly route: string;
      readonly expiresAt: Date;
      readonly consumedAt: Date | null;
      readonly actorId: string | null;
    } | null>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly mobilePushRegistrationRecord: {
    upsert(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly create: Readonly<Record<string, unknown>>;
      readonly update: Readonly<Record<string, unknown>>;
    }): Promise<unknown>;
  };
  readonly mobileReportRecord: {
    create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<
      readonly {
        readonly id: string;
        readonly reportType: string;
        readonly status: string;
        readonly createdAt: Date;
      }[]
    >;
  };
}
