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
import type { IamBootstrapResponse } from '@databreeze/contracts/v4';

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
    const result = await this.identityBootstrap.find(context.actorId);
    if (!result.accepted)
      return Object.freeze({ schemaVersion: 4, outcome: 'REJECTED', code: result.code });
    const value = result.value;
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
    return Object.freeze({
      schemaVersion: 4 as const,
      outcome: 'ACCEPTED' as const,
      value: Object.freeze({
        user: Object.freeze({
          id: value.user.id,
          displayName: value.user.displayName,
          locale: value.user.locale,
          mfaState:
            context.mfaRequired === true ? ('ENABLED' as const) : ('NOT_CONFIGURED' as const),
        }),
        organizations: Object.freeze([
          Object.freeze({
            id: value.organization.id,
            name: value.organization.name,
            personal: value.organization.personal,
            status: value.organization.status,
            workspaces: Object.freeze([
              Object.freeze({
                id: value.workspace.id,
                name: value.workspace.name,
                status: value.workspace.status,
                projects: Object.freeze([
                  Object.freeze({
                    id: value.project.id,
                    name: value.project.name,
                    kind: value.project.kind,
                    status: value.project.status,
                  }),
                ]),
              }),
            ]),
          }),
        ]),
        recentScopes: Object.freeze([
          Object.freeze({
            scopeType: 'project' as const,
            organizationId: value.organization.id,
            workspaceId: value.workspace.id,
            projectId: value.project.id,
          }),
        ]),
        session,
        platform: Object.freeze({ apiVersion: 'v1' as const }),
      }),
    });
  }
}
