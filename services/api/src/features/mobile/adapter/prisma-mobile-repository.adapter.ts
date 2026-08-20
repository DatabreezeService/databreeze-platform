import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  MobileDatabaseClientV1,
  MobileRepositoryPortV1,
  MobileTaskViewV1,
} from '../application/mobile-repository.port.js';

function scope(context: IamTenantContextV1) {
  if (context.tenantScope.scopeType === 'organization')
    throw new Error('MOBILE_WORKSPACE_SCOPE_REQUIRED');
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  } as const;
}

/** Durable mobile control-plane adapter. Provider tokens and route tokens are never stored raw. */
export class PrismaMobileRepositoryAdapter implements MobileRepositoryPortV1 {
  public constructor(private readonly client: MobileDatabaseClientV1) {}

  public listTasks(context: IamTenantContextV1): Promise<readonly MobileTaskViewV1[]> {
    // Tasks are projected from committed domain modules in deployments that expose a task table.
    // Until that projection is enabled, returning an empty, typed page is safer than inventing work.
    void context;
    return Promise.resolve([]);
  }

  public async resolveRouteToken(
    context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<string | undefined> {
    const s = scope(context);
    const row = await this.client.mobileRouteTokenRecord.findFirst({
      where: { ...s, tokenDigest },
    });
    if (!row || row.consumedAt !== null || row.expiresAt.getTime() <= Date.now()) return undefined;
    if (row.actorId !== null && row.actorId !== context.actorId) return undefined;
    const updated = await this.client.mobileRouteTokenRecord.updateMany({
      where: { ...s, tokenDigest, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return updated.count === 1 ? row.route : undefined;
  }

  public async issueRouteToken(
    context: IamTenantContextV1,
    input: { id: string; tokenDigest: string; route: string; expiresAt: Date },
  ): Promise<void> {
    await this.client.mobileRouteTokenRecord.create({
      data: {
        id: input.id,
        ...scope(context),
        tokenDigest: input.tokenDigest,
        route: input.route,
        actorId: context.actorId,
        expiresAt: input.expiresAt,
      },
    });
  }

  public async registerPush(
    context: IamTenantContextV1,
    input: {
      id: string;
      platform: 'ANDROID';
      providerTokenDigest: string;
      installationIdHash: string;
      now: Date;
    },
  ): Promise<void> {
    const s = scope(context);
    await this.client.mobilePushRegistrationRecord.upsert({
      where: {
        mobilePushRegistrationIdentity: {
          ...s,
          actorId: context.actorId,
          installationIdHash: input.installationIdHash,
        },
      },
      create: {
        id: input.id,
        ...s,
        actorId: context.actorId,
        platform: input.platform,
        providerTokenDigest: input.providerTokenDigest,
        installationIdHash: input.installationIdHash,
        status: 'ACTIVE',
        lastSeenAt: input.now,
      },
      update: {
        providerTokenDigest: input.providerTokenDigest,
        status: 'ACTIVE',
        lastSeenAt: input.now,
      },
    });
  }

  public async createReport(
    context: IamTenantContextV1,
    input: { id: string; reportType: string; subjectId?: string; payloadDigest: string },
  ): Promise<void> {
    const s = scope(context);
    await this.client.mobileReportRecord.create({
      data: {
        id: input.id,
        ...s,
        actorId: context.actorId,
        reportType: input.reportType,
        subjectId: input.subjectId ?? null,
        payloadDigest: input.payloadDigest,
        status: 'RECEIVED',
      },
    });
  }

  public async listReports(context: IamTenantContextV1) {
    const rows = await this.client.mobileReportRecord.findMany({
      where: scope(context),
      orderBy: { createdAt: 'desc' },
    });
    return rows.slice(0, 100).map((row) => ({
      reportId: row.id,
      reportType: row.reportType,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
