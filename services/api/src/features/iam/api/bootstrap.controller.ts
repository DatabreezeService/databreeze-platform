import { Controller, Get, Inject, Optional, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  IDENTITY_BOOTSTRAP_SERVICE,
  type IdentityBootstrapService,
} from '../application/identity-bootstrap.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { BootstrapResponseDto } from './bootstrap.dto.js';
import type { IamBootstrapResponse, IamBootstrapScope } from '@databreeze/contracts/v4';

type UserIdentityWithProfileRevision = { readonly profileRevision?: unknown };

/** IAM-001/IAM-009: bootstrap is derived from the authenticated principal, never request scope. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1/me')
export class IamBootstrapController {
  public constructor(
    @Optional()
    @Inject(IDENTITY_BOOTSTRAP_SERVICE)
    private readonly identityBootstrap: IdentityBootstrapService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('bootstrap')
  @ApiOperation({ summary: 'Load safe identity and personal-tenant bootstrap state' })
  @ApiOkResponse({ type: BootstrapResponseDto })
  async bootstrap(@Req() request: unknown): Promise<IamBootstrapResponse> {
    const context = await this.requestContext.resolve(request);
    if (this.identityBootstrap === undefined)
      return Object.freeze({ schemaVersion: 4, outcome: 'REJECTED', code: 'UNAVAILABLE' });
    const legacyIdentityBootstrap = this.identityBootstrap as IdentityBootstrapService & {
      readonly listVisible?: IdentityBootstrapService['listVisible'];
    };
    const result =
      legacyIdentityBootstrap.listVisible !== undefined
        ? await legacyIdentityBootstrap.listVisible(context.actorId)
        : await this.identityBootstrap.find(context.actorId).then((legacy) =>
            legacy.accepted
              ? Object.freeze({
                  accepted: true as const,
                  value: Object.freeze({
                    user: legacy.value.user,
                    organizations: Object.freeze([
                      Object.freeze({
                        ...legacy.value.organization,
                        workspaces: Object.freeze([
                          Object.freeze({
                            ...legacy.value.workspace,
                            projects: Object.freeze([legacy.value.project]),
                          }),
                        ]),
                      }),
                    ]),
                  }),
                })
              : legacy,
          );
    if (!result.accepted)
      return Object.freeze({ schemaVersion: 4, outcome: 'REJECTED', code: result.code });
    const value = result.value;
    const userEmail =
      'email' in value.user && typeof value.user.email === 'string' ? value.user.email : undefined;
    const profileRevisionCandidate =
      'profileRevision' in value.user
        ? (value.user as UserIdentityWithProfileRevision).profileRevision
        : undefined;
    const profileRevision =
      typeof profileRevisionCandidate === 'number' &&
      Number.isSafeInteger(profileRevisionCandidate) &&
      profileRevisionCandidate >= 1
        ? profileRevisionCandidate
        : 1;
    const session =
      context.tenantScope.scopeType === 'organization'
        ? Object.freeze({
            scopeType: 'organization' as const,
            organizationId: context.tenantScope.organizationId,
            authorizationEpoch: context.authorizationEpoch,
          })
        : context.tenantScope.scopeType === 'workspace'
          ? Object.freeze({
              scopeType: 'workspace' as const,
              organizationId: context.tenantScope.organizationId,
              workspaceId: context.tenantScope.workspaceId,
              authorizationEpoch: context.authorizationEpoch,
            })
          : Object.freeze({
              scopeType: 'project' as const,
              organizationId: context.tenantScope.organizationId,
              workspaceId: context.tenantScope.workspaceId,
              projectId: context.tenantScope.projectId,
              authorizationEpoch: context.authorizationEpoch,
            });
    const recentScopes: IamBootstrapScope[] = [];
    for (const organization of value.organizations) {
      for (const workspace of organization.workspaces) {
        const project = workspace.projects[0];
        if (project !== undefined) {
          recentScopes.push({
            scopeType: 'project',
            organizationId: organization.id,
            workspaceId: workspace.id,
            projectId: project.id,
          });
        } else {
          recentScopes.push({
            scopeType: 'workspace',
            organizationId: organization.id,
            workspaceId: workspace.id,
          });
        }
      }
    }
    return Object.freeze({
      schemaVersion: 4 as const,
      outcome: 'ACCEPTED' as const,
      value: Object.freeze({
        user: Object.freeze({
          id: value.user.id,
          ...(userEmail === undefined ? {} : { email: userEmail }),
          displayName: value.user.displayName,
          locale: value.user.locale,
          profileRevision,
          mfaState:
            context.mfaRequired === true ? ('ENABLED' as const) : ('NOT_CONFIGURED' as const),
        }),
        organizations: Object.freeze(
          value.organizations.map((organization) =>
            Object.freeze({
              id: organization.id,
              name: organization.name,
              personal: organization.personal,
              status: organization.status,
              workspaces: Object.freeze(
                organization.workspaces.map((workspace) =>
                  Object.freeze({
                    id: workspace.id,
                    name: workspace.name,
                    status: workspace.status,
                    projects: Object.freeze(
                      workspace.projects.map((project) =>
                        Object.freeze({
                          id: project.id,
                          name: project.name,
                          kind: project.kind,
                          status: project.status,
                        }),
                      ),
                    ),
                  }),
                ),
              ),
            }),
          ),
        ),
        recentScopes: Object.freeze(recentScopes),
        session,
        platform: Object.freeze({ apiVersion: 'v1' as const }),
      }),
    });
  }
}
