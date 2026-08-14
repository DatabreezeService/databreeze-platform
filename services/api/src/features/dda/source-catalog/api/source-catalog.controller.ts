import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import {
  ORIGINAL_VIEW_SERVICE,
  type OriginalViewService,
} from '../application/original-view.service.js';
import {
  SOURCE_CATALOG_SERVICE,
  type SourceCatalogService,
} from '../application/source-catalog.service.js';

export class ListSourceCatalogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'memberAuthorized',
  'actor',
  'actorId',
  'memberId',
  'organizationId',
  'orgId',
  'workspaceId',
  'projectId',
  'authorization',
  'authorized',
  'role',
]);

function hasClientAuthorityField(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthorityField(child, seen),
  );
}

function statusFor(result: unknown): number {
  if (typeof result !== 'object' || result === null || !('accepted' in result)) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  const candidate = result as { readonly accepted?: unknown; readonly code?: unknown };
  if (candidate.accepted === true) return HttpStatus.OK;
  switch (candidate.code) {
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function preserve<TValue>(result: TValue, reply?: FastifyReply): TValue {
  reply?.code(statusFor(result));
  return result;
}

/** DDA-052: governed source catalog and safe original views. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/datasets')
export class SourceCatalogController {
  public constructor(
    @Optional()
    @Inject(SOURCE_CATALOG_SERVICE)
    private readonly catalog: SourceCatalogService | undefined,
    @Optional()
    @Inject(ORIGINAL_VIEW_SERVICE)
    private readonly originals: OriginalViewService | undefined,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  private readonly requestContext: RequestTenantContextPortV1;

  private unavailable() {
    return { accepted: false as const, code: 'UNAVAILABLE' as const };
  }

  @Get(':datasetId/sources')
  @ApiOperation({ summary: 'List permission-filtered sources for one logical dataset' })
  @ApiOkResponse({ description: 'The source catalog page.' })
  async listSources(
    @Req() request: unknown,
    @Param('datasetId') datasetId: string,
    @Query() query: ListSourceCatalogQueryDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    this.rejectClientAuthority(request, query);
    const context = await this.resolveContext(request);
    let result;
    try {
      result = this.catalog
        ? await this.catalog.listDatasetSources(context, datasetId, query.cursor, query.limit)
        : this.unavailable();
    } catch {
      result = this.unavailable();
    }
    return preserve(result, reply);
  }

  @Post(':datasetId/sources/:sourceId/original-view')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve a safe original view for one authorized source' })
  @ApiOkResponse({ description: 'The original view descriptor.' })
  async resolveOriginalView(
    @Req() request: unknown,
    @Param('datasetId') datasetId: string,
    @Param('sourceId') sourceId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    this.rejectClientAuthority(request);
    const context = await this.resolveContext(request);
    let result;
    try {
      result = this.originals
        ? await this.originals.resolveOriginalView(context, datasetId, sourceId)
        : this.unavailable();
    } catch {
      result = this.unavailable();
    }
    return preserve(result, reply);
  }

  private rejectClientAuthority(request: unknown, ...clientInputs: readonly unknown[]): void {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      clientInputs.some((input) => hasClientAuthorityField(input)) ||
      hasClientAuthorityField(requestRecord?.['body']) ||
      hasClientAuthorityField(requestRecord?.['query']) ||
      hasClientAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
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
}
