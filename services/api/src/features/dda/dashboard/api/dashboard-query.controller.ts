import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { DashboardQueryServiceV1 } from '../application/dashboard-query.service.js';
import type { DashboardAuthActionV1 } from '../application/dashboard-authorization.port.js';
import {
  DASHBOARD_PERMISSION_PROJECTION_PORT,
  DASHBOARD_RESULT_READER_PORT,
  hasClientAuthorityFields,
  UnavailableDashboardResultReaderV1,
  type DashboardResultReaderPortV1,
  type DashboardPermissionProjectionPortV1,
} from '../application/dashboard-http-ports.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

export interface DashboardViewDtoV1 {
  readonly snapshotId: string;
}

export type DashboardInteractiveActionV1 = Extract<
  DashboardAuthActionV1,
  'VIEW' | 'FILTER' | 'DRILL' | 'SUBSCRIBE'
>;

export interface DashboardAuthorizeDtoV1 {
  readonly snapshotId: string;
  readonly action: DashboardInteractiveActionV1;
}

function resourceIdentifier(input: unknown): string {
  if (typeof input !== 'string') throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  return parsed.value;
}

function isInteractiveAction(input: unknown): input is DashboardInteractiveActionV1 {
  return input === 'VIEW' || input === 'FILTER' || input === 'DRILL' || input === 'SUBSCRIBE';
}

@ApiTags('dda-dashboard-query')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/dashboards/query')
export class DashboardQueryControllerV1 {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly results: DashboardResultReaderPortV1;
  private readonly projection: DashboardPermissionProjectionPortV1 | undefined;

  public constructor(
    private readonly queries: DashboardQueryServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(DASHBOARD_RESULT_READER_PORT)
    results?: DashboardResultReaderPortV1,
    @Optional()
    @Inject(DASHBOARD_PERMISSION_PROJECTION_PORT)
    projection?: DashboardPermissionProjectionPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.results = results ?? new UnavailableDashboardResultReaderV1();
    this.projection = projection;
  }

  @Post('view')
  public async view(@Req() request: unknown, @Body() body: DashboardViewDtoV1) {
    this.rejectClientAuthority(request, body);
    const context = await this.resolveContext(request);
    const snapshotId = resourceIdentifier(body?.snapshotId);
    let preauthorization;
    try {
      preauthorization = await this.queries.authorizeAction(context, {
        snapshotId,
        action: 'VIEW',
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!preauthorization.accepted) throw new ForbiddenException({ code: 'UNAUTHORIZED' });

    if (this.projection !== undefined) {
      let currentProjection;
      try {
        currentProjection = await this.projection.resolve({ context, snapshotId });
      } catch {
        throw new ServiceUnavailableException();
      }
      if (!currentProjection.accepted) {
        if (currentProjection.code === 'PERMISSION_REVOKED') {
          throw new ForbiddenException({ code: 'UNAUTHORIZED' });
        }
        throw new ServiceUnavailableException();
      }
    }

    let resolved;
    try {
      resolved = await this.results.read({ context, snapshotId });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!resolved.accepted) {
      if (resolved.code === 'NOT_FOUND') throw new ForbiddenException({ code: 'UNAUTHORIZED' });
      if (resolved.code === 'UNAUTHORIZED') throw new ForbiddenException({ code: 'UNAUTHORIZED' });
      throw new ServiceUnavailableException();
    }
    if (!this.isSafeRows(resolved.rows)) throw new ServiceUnavailableException();

    let result;
    try {
      result = await this.queries.view(context, { snapshotId, rows: resolved.rows });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    return result;
  }

  @Post('authorize')
  public async authorize(@Req() request: unknown, @Body() body: DashboardAuthorizeDtoV1) {
    this.rejectClientAuthority(request, body);
    const context = await this.resolveContext(request);
    const snapshotId = resourceIdentifier(body?.snapshotId);
    if (!isInteractiveAction(body?.action)) {
      throw new BadRequestException({ code: 'INVALID_ACTION' });
    }
    let result;
    try {
      result = await this.queries.authorizeAction(context, {
        snapshotId,
        action: body.action,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    return result;
  }

  private rejectClientAuthority(request: unknown, body: unknown): void {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      hasClientAuthorityFields(request, body)
    ) {
      throw new BadRequestException({ code: 'INVALID_DASHBOARD_QUERY' });
    }
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

  private isSafeRows(rows: unknown): rows is readonly Record<string, string>[] {
    if (!Array.isArray(rows)) return false;
    return rows.every((row) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return false;
      return Object.entries(row as Record<string, unknown>).every(
        ([key, value]) => typeof key === 'string' && typeof value === 'string',
      );
    });
  }
}
