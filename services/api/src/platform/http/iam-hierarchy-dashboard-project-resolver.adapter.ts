import type { IamHierarchyRepositoryPortV1 } from '../../features/iam/application/hierarchy-repository.port.js';
import type { IamTenantContextV1 } from '../../features/iam/application/tenant-context.js';
import type { DashboardProjectResolverPortV1 } from './dashboard-project-resolver.port.js';

/**
 * IAM-002 / DDA-013: project dashboard routes may use the only active project
 * belonging to the authenticated workspace. Ambiguous or foreign rows fail closed.
 */
export class IamHierarchyDashboardProjectResolverAdapter implements DashboardProjectResolverPortV1 {
  public constructor(private readonly hierarchy: IamHierarchyRepositoryPortV1) {}

  public async resolveDashboardProject(context: IamTenantContextV1) {
    if (context.tenantScope.scopeType !== 'workspace') return undefined;

    const { organizationId, workspaceId } = context.tenantScope;
    const projects = await this.hierarchy.listProjects(context, workspaceId);
    const activeProjects = projects.filter(
      (project) =>
        project.status === 'ACTIVE' &&
        project.organizationId === organizationId &&
        project.workspaceId === workspaceId,
    );

    return activeProjects.length === 1 ? activeProjects[0]?.id : undefined;
  }
}
