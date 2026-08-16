import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseV4Contract, type DdaDashboardWidgetResultsAccepted } from '@databreeze/contracts/v4';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DASHBOARD_AUTHORIZATION_PORT,
  DASHBOARD_PERMISSION_PROJECTION_PORT,
  hasClientAuthorityFields,
  type DashboardHttpAuthorizationPortV1,
  type DashboardPermissionProjectionPortV1,
} from '../application/dashboard-http-ports.js';
import {
  DASHBOARD_WIDGET_RESULT_READER_PORT,
  type DashboardWidgetResultReaderPortV1,
} from '../application/dashboard-widget-result.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

const RESULT_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-dashboard-widget-results-accepted';

function resourceIdentifier(input: unknown): string {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  return parsed.value;
}

/** DDA-018/DDA-026/DDA-033: exact, reauthorized, last-good widget result read. */
@ApiTags('dda-dashboard-results')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardWidgetResultsControllerV1 {
  public constructor(
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
    @Inject(DASHBOARD_AUTHORIZATION_PORT)
    private readonly authorization: DashboardHttpAuthorizationPortV1,
    @Inject(DASHBOARD_PERMISSION_PROJECTION_PORT)
    private readonly projection: DashboardPermissionProjectionPortV1,
    @Inject(DASHBOARD_WIDGET_RESULT_READER_PORT)
    private readonly results: DashboardWidgetResultReaderPortV1,
  ) {}

  @Get(':dashboardId/snapshots/:snapshotId/widget-results')
  @ApiOperation({ summary: 'Read bounded deterministic results for an exact authorized snapshot' })
  public async get(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
    @Param('snapshotId') snapshotId: string,
  ): Promise<DdaDashboardWidgetResultsAccepted> {
    if (hasClientAuthorityFields(request)) {
      throw new BadRequestException({ code: 'INVALID_DASHBOARD_RESULT_REQUEST' });
    }
    const parsedDashboardId = resourceIdentifier(dashboardId);
    const parsedSnapshotId = resourceIdentifier(snapshotId);
    const context = await this.resolveContext(request);

    let authorized;
    try {
      authorized = await this.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId: parsedDashboardId,
        action: 'VIEW',
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!authorized.allowed) throw new ForbiddenException({ code: 'UNAUTHORIZED' });

    let projection;
    try {
      projection = await this.projection.resolve({ context, snapshotId: parsedSnapshotId });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!projection.accepted) {
      if (projection.code === 'PERMISSION_REVOKED') {
        throw new ForbiddenException({ code: 'UNAUTHORIZED' });
      }
      throw new ServiceUnavailableException();
    }

    let read;
    try {
      read = await this.results.read({
        context,
        dashboardId: parsedDashboardId,
        snapshotId: parsedSnapshotId,
        permissionProjectionVersionId: projection.permissionProjectionVersionId,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!read.accepted) {
      if (read.code === 'NOT_FOUND' || read.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ code: 'UNAUTHORIZED' });
      }
      throw new ServiceUnavailableException();
    }
    const parsed = parseV4Contract<DdaDashboardWidgetResultsAccepted>(RESULT_SCHEMA_ID, read.value);
    if (!parsed.accepted) throw new ServiceUnavailableException();
    return parsed.value;
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
  }
}
