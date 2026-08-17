import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamRepositoryPortV1 } from './iam-repository.port.js';
import type { IamHierarchyRepositoryPortV1 } from './hierarchy-repository.port.js';
import type { AuthenticatedPrincipalV1, AuthenticationSessionV1 } from './authentication.port.js';
import type { SessionLifecyclePortV1 } from './session-lifecycle.port.js';
import { createIamTenantContextV1, type IamTenantContextV1 } from './tenant-context.js';

export const IAM_SCOPE_SWITCH_SERVICE = Symbol('IAM_SCOPE_SWITCH_SERVICE');

export type IamScopeSwitchCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'SESSION_INVALID'
  | 'UNAVAILABLE';

export type IamScopeSwitchResultV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly session: AuthenticationSessionV1 };
    }
  | { readonly accepted: false; readonly code: IamScopeSwitchCodeV1 };

function rejected(code: IamScopeSwitchCodeV1): IamScopeSwitchResultV1 {
  return Object.freeze({ accepted: false, code });
}

/** IAM-028: verify target membership and workspace state before replacing the session scope. */
export class IamScopeSwitchService {
  public constructor(
    private readonly sessions: SessionLifecyclePortV1,
    private readonly memberships: IamRepositoryPortV1,
    private readonly hierarchy: IamHierarchyRepositoryPortV1,
  ) {}

  public async switchWorkspace(
    context: IamTenantContextV1,
    workspaceIdInput: unknown,
    clientPlatform: 'android' | 'desktop' | 'web',
  ): Promise<IamScopeSwitchResultV1> {
    const workspaceId = parseStableIdentifierV1(workspaceIdInput);
    if (!workspaceId.accepted) return rejected('INVALID_IDENTIFIER');
    if (context.sessionId === undefined) return rejected('SESSION_INVALID');
    const targetContext = createIamTenantContextV1({
      sessionId: context.sessionId,
      tenantScope: {
        scopeType: 'workspace',
        organizationId: context.tenantScope.organizationId,
        workspaceId: workspaceId.value,
      },
      actorId: context.actorId,
      correlationId: context.correlationId,
      idempotencyKey: context.idempotencyKey,
      authorizationEpoch: context.authorizationEpoch,
      mfaRequired: context.mfaRequired,
      mfaReenrollmentRequired: context.mfaReenrollmentRequired,
    });
    if (!targetContext.accepted) return rejected('INVALID_IDENTIFIER');

    try {
      const organizationContext = createIamTenantContextV1({
        sessionId: context.sessionId,
        tenantScope: {
          scopeType: 'organization',
          organizationId: context.tenantScope.organizationId,
        },
        actorId: context.actorId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        authorizationEpoch: context.authorizationEpoch,
        mfaRequired: context.mfaRequired,
        mfaReenrollmentRequired: context.mfaReenrollmentRequired,
      });
      if (!organizationContext.accepted) return rejected('INVALID_IDENTIFIER');
      const organization = await this.hierarchy.findOrganization(
        organizationContext.value,
        context.tenantScope.organizationId,
      );
      if (organization === undefined || organization.status !== 'ACTIVE')
        return rejected('NOT_FOUND');
      const workspace = await this.hierarchy.findWorkspace(targetContext.value, workspaceId.value);
      if (workspace === undefined || workspace.status !== 'ACTIVE') return rejected('NOT_FOUND');
      const membership = await this.memberships.findMembership(
        targetContext.value,
        context.actorId,
      );
      if (membership === undefined || membership.status !== 'ACTIVE')
        return rejected('SCOPE_DENIED');

      const principal: AuthenticatedPrincipalV1 = Object.freeze({
        userId: context.actorId,
        organizationId: context.tenantScope.organizationId,
        workspaceId: workspace.id,
        securityEpoch: context.authorizationEpoch,
        mfaRequired: context.mfaRequired ?? false,
        mfaReenrollmentRequired: context.mfaReenrollmentRequired,
      });
      if (this.sessions.switchScope === undefined) return rejected('UNAVAILABLE');
      const switched = await this.sessions.switchScope(
        context.sessionId,
        principal,
        clientPlatform,
      );
      if (!switched.accepted)
        return rejected(switched.code === 'INVALID_SESSION' ? 'SESSION_INVALID' : 'UNAVAILABLE');
      return Object.freeze({ accepted: true, value: Object.freeze({ session: switched.value }) });
    } catch {
      return rejected('UNAVAILABLE');
    }
  }
}
