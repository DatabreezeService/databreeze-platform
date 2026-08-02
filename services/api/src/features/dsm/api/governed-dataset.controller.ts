import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  GOVERNED_DATASET_REPOSITORY_PORT,
  type GovernedDatasetRepositoryPortV1,
} from '../application/governed-dataset-repository.port.js';
import { GovernedDatasetService } from '../application/governed-dataset.service.js';
import { CreateGovernedDatasetDto } from './governed-dataset.dto.js';
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
}
