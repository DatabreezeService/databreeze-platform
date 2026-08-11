export interface TenantLiveConfigurationV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly sessionId: string;
  readonly tenantScope:
    | {
        readonly scopeType: 'workspace';
        readonly organizationId: string;
        readonly workspaceId: string;
      }
    | {
        readonly scopeType: 'project';
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
}

type TenantEnvironment = Readonly<Record<string, unknown>>;

function configuredString(environment: TenantEnvironment, key: string): string | undefined {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

/**
 * DDA-002/006: live intake, ETL accept, and publish require explicit tenant context.
 * Fail closed when organization, workspace, or intake session is missing.
 */
export function tenantLiveConfiguration(
  environment: TenantEnvironment = import.meta.env,
): TenantLiveConfigurationV1 | undefined {
  const organizationId = configuredString(environment, 'VITE_DATABREEZE_ORGANIZATION_ID');
  const workspaceId = configuredString(environment, 'VITE_DATABREEZE_WORKSPACE_ID');
  const sessionId = configuredString(environment, 'VITE_DATABREEZE_INTAKE_SESSION_ID');
  if (organizationId === undefined || workspaceId === undefined || sessionId === undefined) {
    return undefined;
  }
  const projectId = configuredString(environment, 'VITE_DATABREEZE_PROJECT_ID');
  if (projectId !== undefined) {
    return Object.freeze({
      organizationId,
      workspaceId,
      projectId,
      sessionId,
      tenantScope: Object.freeze({
        scopeType: 'project' as const,
        organizationId,
        workspaceId,
        projectId,
      }),
    });
  }
  return Object.freeze({
    organizationId,
    workspaceId,
    sessionId,
    tenantScope: Object.freeze({
      scopeType: 'workspace' as const,
      organizationId,
      workspaceId,
    }),
  });
}
