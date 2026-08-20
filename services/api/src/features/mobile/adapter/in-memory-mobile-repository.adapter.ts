import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { MobileRepositoryPortV1, MobileTaskViewV1 } from '../application/mobile-repository.port.js';

export class InMemoryMobileRepositoryAdapter implements MobileRepositoryPortV1 {
  private readonly routes = new Map<string, { route: string; actorId?: string; expiresAt: number }>();
  private readonly tasks: MobileTaskViewV1[] = [];
  public async listTasks(): Promise<readonly MobileTaskViewV1[]> { return this.tasks; }
  public async resolveRouteToken(context: IamTenantContextV1, tokenDigest: string): Promise<string | undefined> {
    const workspaceId = context.tenantScope.scopeType === 'organization' ? undefined : context.tenantScope.workspaceId;
    const row = workspaceId === undefined ? undefined : this.routes.get(`${context.tenantScope.scopeType}:${workspaceId}:${tokenDigest}`);
    if (!row || row.expiresAt <= Date.now() || (row.actorId && row.actorId !== context.actorId)) return undefined;
    this.routes.delete(`${context.tenantScope.scopeType}:${workspaceId}:${tokenDigest}`); return row.route;
  }
  public async issueRouteToken(context: IamTenantContextV1, input: { id: string; tokenDigest: string; route: string; expiresAt: Date }): Promise<void> {
    if (context.tenantScope.scopeType !== 'organization') this.routes.set(`${context.tenantScope.scopeType}:${context.tenantScope.workspaceId}:${input.tokenDigest}`, { route: input.route, actorId: context.actorId, expiresAt: input.expiresAt.getTime() });
  }
  public async registerPush(): Promise<void> { return; }
  public async createReport(): Promise<void> { return; }
  public async listReports(): Promise<readonly { reportId: string; reportType: string; status: string; createdAt: string }[]> { return []; }
}
