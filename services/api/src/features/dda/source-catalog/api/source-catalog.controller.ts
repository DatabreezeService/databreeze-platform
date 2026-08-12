import {
  Body,
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  REQUEST_TENANT_CONTEXT,
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
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
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
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

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
    const context = await this.requestContext.resolve(request);
    const result = this.catalog
      ? await this.catalog.listDatasetSources(context, datasetId, query.cursor, query.limit)
      : this.unavailable();
    return preserve(result, reply);
  }

  @Post(':datasetId/sources/:sourceId/original-view')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve a safe original view for one authorized source' })
  @ApiOkResponse({ description: 'The original view descriptor.' })
  async resolveOriginalView(
    @Req() request: unknown,
    @Param('sourceId') sourceId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.originals
      ? await this.originals.resolveOriginalView(context, sourceId)
      : this.unavailable();
    return preserve(result, reply);
  }
}
