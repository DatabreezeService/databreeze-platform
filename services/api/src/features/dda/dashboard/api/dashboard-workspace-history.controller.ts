import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { parseV3Contract, type DdaDashboardWorkspaceHistory } from '@databreeze/contracts/v3';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import { DashboardWorkspaceHistoryServiceV1 } from '../application/dashboard-workspace-history.service.js';

export class DashboardWorkspaceHistoryQueryDtoV1 {
  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

const HISTORY_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-workspace-history';

function hasContextField(input: unknown): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.prototype.hasOwnProperty.call(input, 'context')
  );
}

/** DDA-026/DDA-031/DDA-033/DDA-036: current-session scoped history only. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v3/dda/dashboards')
export class DashboardWorkspaceHistoryControllerV1 {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly history: DashboardWorkspaceHistoryServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Get('workspace-history')
  @ApiOperation({ summary: 'List current-scope dashboard and analysis history metadata' })
  @ApiOkResponse({
    description: 'A permission-filtered, cursor-paged history page.',
    schema: { $ref: '#/components/schemas/DdaDashboardWorkspaceHistory' },
  })
  public async list(
    @Req() request: unknown,
    @Query() query: DashboardWorkspaceHistoryQueryDtoV1,
  ): Promise<DdaDashboardWorkspaceHistory> {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasContextField(query) ||
      hasContextField(requestRecord?.['body']) ||
      hasContextField(requestRecord?.['query'])
    ) {
      throw new BadRequestException();
    }
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'AUTHENTICATION_UNAVAILABLE') throw new ServiceUnavailableException();
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
    let result;
    try {
      result = await this.history.list(context, {
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit ?? 30,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) {
      if (result.code === 'INVALID_CURSOR' || result.code === 'INVALID_PAGE') {
        throw new BadRequestException();
      }
      if (result.code === 'INVALID_SCOPE') throw new NotFoundException();
      throw new ServiceUnavailableException();
    }
    const payload = Object.freeze({
      schemaVersion: 3 as const,
      items: result.value.items,
      ...(result.value.nextCursor === undefined ? {} : { nextCursor: result.value.nextCursor }),
    });
    const parsed = parseV3Contract<DdaDashboardWorkspaceHistory>(HISTORY_SCHEMA_ID, payload);
    if (!parsed.accepted) throw new ServiceUnavailableException();
    return Object.freeze(parsed.value);
  }
}
