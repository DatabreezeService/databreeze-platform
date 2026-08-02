import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DATASET_QUALITY_REPOSITORY_PORT,
  type DatasetQualityRepositoryPortV1,
} from '../application/dataset-quality-repository.port.js';
import { DatasetQualityService } from '../application/dataset-quality.service.js';
import { RegisterDatasetQualityResultDto } from './dataset-quality.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/dataset-quality-results')
export class DatasetQualityController {
  private readonly quality: DatasetQualityService;

  public constructor(
    @Inject(DATASET_QUALITY_REPOSITORY_PORT) repository: DatasetQualityRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.quality = new DatasetQualityService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Register an immutable, value-free dataset quality result' })
  @ApiBody({ type: RegisterDatasetQualityResultDto })
  async register(
    @Req() request: unknown,
    @Body() input: RegisterDatasetQualityResultDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.quality.register(context, {
      ...input,
      tenantScope: context.tenantScope,
    });
  }

  @Get(':resultId')
  @ApiOperation({ summary: 'Read an exact immutable dataset quality result' })
  async get(@Req() request: unknown, @Param('resultId') resultIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const resultId = parseStableIdentifierV1(resultIdInput);
    if (!resultId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.quality.find(context, resultId.value);
  }

  @Get()
  @ApiOperation({ summary: 'List quality results for one exact dataset version' })
  async list(
    @Req() request: unknown,
    @Query('datasetVersionId') datasetVersionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetVersionId = parseStableIdentifierV1(datasetVersionIdInput);
    if (!datasetVersionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.quality.list(context, datasetVersionId.value);
  }
}
