import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { FreshnessService, type FreshnessResultV1 } from '../application/freshness.service.js';
import {
  DASHBOARD_AUTHORIZATION_PORT,
  DASHBOARD_PERMISSION_PROJECTION_PORT,
  hasClientAuthorityFields,
  UnavailableDashboardPermissionProjectionPortV1,
  type DashboardHttpAuthorizationPortV1,
  type DashboardPermissionProjectionPortV1,
} from '../../dashboard/application/dashboard-http-ports.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

function resourceIdentifier(input: unknown): string {
  if (typeof input !== 'string') throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  return parsed.value;
}

/**
 * DDA-033 freshness REST surface.
 * Root composition is owned by plan 087; this controller is exported for integration.
 */
@ApiTags('dda-dashboard-refresh')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardRefreshController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly projection: DashboardPermissionProjectionPortV1;

  public constructor(
    private readonly freshness: FreshnessService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(DASHBOARD_AUTHORIZATION_PORT)
    private readonly authorization?: DashboardHttpAuthorizationPortV1,
    @Optional()
    @Inject(DASHBOARD_PERMISSION_PROJECTION_PORT)
    projection?: DashboardPermissionProjectionPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.projection = projection ?? new UnavailableDashboardPermissionProjectionPortV1();
  }

  @Get(':dashboardId/freshness')
  @ApiOperation({ summary: 'Read authorized dashboard freshness and last-good snapshot refs' })
  public async getFreshness(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
  ): Promise<FreshnessResultV1> {
    this.rejectClientAuthority(request);
    const context = await this.resolveContext(request);
    const parsedDashboardId = resourceIdentifier(dashboardId);
    if (this.authorization === undefined) throw new ServiceUnavailableException();

    let authorization;
    try {
      authorization = await this.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId: parsedDashboardId,
        action: 'VIEW',
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!authorization.allowed) throw new ForbiddenException({ code: 'UNAUTHORIZED' });

    let projection;
    try {
      projection = await this.projection.resolve({ context, dashboardId: parsedDashboardId });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!projection.accepted) {
      if (projection.code === 'PERMISSION_REVOKED') {
        throw new ForbiddenException({ code: 'UNAUTHORIZED' });
      }
      throw new ServiceUnavailableException();
    }
    if (
      typeof projection.permissionProjectionVersionId !== 'string' ||
      projection.permissionProjectionVersionId.length === 0
    ) {
      throw new ServiceUnavailableException();
    }

    let result: FreshnessResultV1;
    try {
      result = await this.freshness.getFreshness({
        tenantScope: context.tenantScope,
        dashboardId: parsedDashboardId,
        authorizedPermissionProjectionVersionId: projection.permissionProjectionVersionId,
        nowMs: Date.now(),
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted && result.code === 'PERMISSION_REVOKED') {
      throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    }
    if (!result.accepted && result.code === 'DASHBOARD_NOT_FOUND') {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    return result;
  }

  private rejectClientAuthority(request: unknown): void {
    if (hasClientAuthorityFields(request))
      throw new BadRequestException({ code: 'INVALID_FRESHNESS_REQUEST' });
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
  }
}
