import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  MAPPING_REPOSITORY_PORT,
  type MappingRepositoryPortV1,
} from '../application/mapping-repository.port.js';
import { MappingService } from '../application/mapping.service.js';
import { CreateMappingDto, PublishDefinitionDto } from './mapping.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/datasets/:datasetId/mappings')
export class MappingController {
  private readonly mappings: MappingService;

  public constructor(
    @Inject(MAPPING_REPOSITORY_PORT) repository: MappingRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.mappings = new MappingService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable mapping definition draft' })
  @ApiBody({ type: CreateMappingDto })
  async create(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Body() input: CreateMappingDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    if (!datasetId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.mappings.create(context, {
      ...input,
      datasetId: datasetId.value,
      tenantScope: context.tenantScope,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List immutable mapping versions' })
  async list(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    if (!datasetId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.mappings.list(context, datasetId.value);
  }

  @Post(':versionId/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a mapping definition as a new immutable version' })
  @ApiBody({ type: PublishDefinitionDto })
  async publish(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Param('versionId') versionIdInput: string,
    @Body() input: PublishDefinitionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!datasetId.accepted || !versionId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.mappings.publish(context, versionId.value, input.nextVersionId, input.publishedAt);
  }
}
