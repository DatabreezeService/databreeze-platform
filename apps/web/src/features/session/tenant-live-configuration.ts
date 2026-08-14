import { currentAuthBootstrapV1 } from '../auth/auth-session.ts';

export interface TenantLiveConfigurationV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  /** Optional legacy finalize-session handle; create/upload is server-owned. */
  readonly sessionId?: string;
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
 * The authenticated bootstrap is authoritative; a build-time intake-session variable is
 * optional and is used only by the legacy finalize-session fallback.
 */
export function tenantLiveConfiguration(
  environment: TenantEnvironment = import.meta.env,
): TenantLiveConfigurationV1 | undefined {
  const scope = currentAuthBootstrapV1()?.session;
  const sessionId = configuredString(environment, 'VITE_DATABREEZE_INTAKE_SESSION_ID');
  if (scope === undefined || scope.scopeType === 'organization') {
    return undefined;
  }
  if (scope.scopeType === 'project') {
    return Object.freeze({
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      ...(sessionId === undefined ? {} : { sessionId }),
      tenantScope: Object.freeze({
        scopeType: 'project' as const,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      }),
    });
  }
  return Object.freeze({
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    ...(sessionId === undefined ? {} : { sessionId }),
    tenantScope: Object.freeze({
      scopeType: 'workspace' as const,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
    }),
  });
}
