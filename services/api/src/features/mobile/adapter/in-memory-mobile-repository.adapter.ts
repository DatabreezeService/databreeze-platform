import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  MobileRepositoryPortV1,
  MobileTaskViewV1,
} from '../application/mobile-repository.port.js';

export class InMemoryMobileRepositoryAdapter implements MobileRepositoryPortV1 {
  private readonly routes = new Map<
    string,
    { route: string; actorId?: string; expiresAt: number }
  >();
  private readonly tasks: MobileTaskViewV1[] = [];
  public listTasks(): Promise<readonly MobileTaskViewV1[]> {
    return Promise.resolve(this.tasks);
  }
  public resolveRouteToken(
    context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<string | undefined> {
    const workspaceId =
      context.tenantScope.scopeType === 'organization'
        ? undefined
        : context.tenantScope.workspaceId;
    const row =
      workspaceId === undefined
        ? undefined
        : this.routes.get(`${context.tenantScope.scopeType}:${workspaceId}:${tokenDigest}`);
    if (!row || row.expiresAt <= Date.now() || (row.actorId && row.actorId !== context.actorId))
      return Promise.resolve(undefined);
    this.routes.delete(`${context.tenantScope.scopeType}:${workspaceId}:${tokenDigest}`);
    return Promise.resolve(row.route);
  }
  public issueRouteToken(
    context: IamTenantContextV1,
    input: { id: string; tokenDigest: string; route: string; expiresAt: Date },
  ): Promise<void> {
    if (context.tenantScope.scopeType !== 'organization')
      this.routes.set(
        `${context.tenantScope.scopeType}:${context.tenantScope.workspaceId}:${input.tokenDigest}`,
        { route: input.route, actorId: context.actorId, expiresAt: input.expiresAt.getTime() },
      );
    return Promise.resolve();
  }
  public registerPush(): Promise<void> {
    return Promise.resolve();
  }
  public createReport(): Promise<void> {
    return Promise.resolve();
  }
  public listReports(): Promise<
    readonly { reportId: string; reportType: string; status: string; createdAt: string }[]
  > {
    return Promise.resolve([]);
  }
}
