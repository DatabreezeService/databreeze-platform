import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  GOVERNED_DATASET_REPOSITORY_PORT,
  type GovernedDatasetRepositoryPortV1,
} from '../application/governed-dataset-repository.port.js';
import { GovernedDatasetService } from '../application/governed-dataset.service.js';
import { CreateGovernedDatasetDto, PublishGovernedDatasetDto } from './governed-dataset.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/datasets')
export class GovernedDatasetController {
  private readonly datasets: GovernedDatasetService;

  public constructor(
    @Inject(GOVERNED_DATASET_REPOSITORY_PORT)
    repository: GovernedDatasetRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.datasets = new GovernedDatasetService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable governed dataset definition draft' })
  @ApiBody({ type: CreateGovernedDatasetDto })
  async create(@Req() request: unknown, @Body() input: CreateGovernedDatasetDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.datasets.create(context, {
      ...input,
      tenantScope: context.tenantScope,
    });
  }

  @Get(':datasetId/versions')
  @ApiOperation({ summary: 'List governed dataset versions visible to the caller' })
  async list(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    if (!datasetId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.datasets.list(context, datasetId.value);
  }

  @Get(':datasetId/versions/:versionId')
  @ApiOperation({ summary: 'Read one exact immutable governed dataset definition' })
  async getVersion(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Param('versionId') versionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!datasetId.accepted || !versionId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const result = await this.datasets.find(context, versionId.value);
    if (!result.accepted || result.value.datasetId !== datasetId.value)
      return { accepted: false, code: 'VERSION_NOT_FOUND' as const };
    return result;
  }

  @Post(':datasetId/versions/:versionId/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a governed dataset definition as a new immutable version' })
  @ApiBody({ type: PublishGovernedDatasetDto })
  async publish(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Param('versionId') versionIdInput: string,
    @Body() input: PublishGovernedDatasetDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!datasetId.accepted || !versionId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const current = await this.datasets.find(context, versionId.value);
    if (!current.accepted || current.value.datasetId !== datasetId.value)
      return { accepted: false, code: 'VERSION_NOT_FOUND' as const };
    return this.datasets.publish(context, versionId.value, input.nextVersionId, input.publishedAt);
  }

  @Get(':datasetId/compatibility')
  @ApiOperation({ summary: 'Classify compatibility between two exact schema versions' })
  async compare(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Query('previousVersionId') previousVersionIdInput: string,
    @Query('nextVersionId') nextVersionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    const previousVersionId = parseStableIdentifierV1(previousVersionIdInput);
    const nextVersionId = parseStableIdentifierV1(nextVersionIdInput);
    if (!datasetId.accepted || !previousVersionId.accepted || !nextVersionId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const [previous, next] = await Promise.all([
      this.datasets.find(context, previousVersionId.value),
      this.datasets.find(context, nextVersionId.value),
    ]);
    if (
      !previous.accepted ||
      !next.accepted ||
      previous.value.datasetId !== datasetId.value ||
      next.value.datasetId !== datasetId.value
    )
      return { accepted: false, code: 'VERSION_NOT_FOUND' as const };
    return this.datasets.compare(context, previousVersionId.value, nextVersionId.value);
  }
}
