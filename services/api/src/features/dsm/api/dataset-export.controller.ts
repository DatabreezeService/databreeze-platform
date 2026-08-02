import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  DATASET_EXPORT_REPOSITORY_PORT,
  type DatasetExportRepositoryPortV1,
} from '../application/dataset-export-repository.port.js';
import { DatasetExportService } from '../application/dataset-export.service.js';
import {
  DATASET_VERSION_REPOSITORY_PORT,
  type DatasetVersionRepositoryPortV1,
} from '../application/dataset-version-repository.port.js';
import { CreateDatasetExportManifestDto } from './dataset-export.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/dataset-exports')
export class DatasetExportController {
  private readonly exports: DatasetExportService;

  public constructor(
    @Inject(DATASET_EXPORT_REPOSITORY_PORT) manifests: DatasetExportRepositoryPortV1,
    @Inject(DATASET_VERSION_REPOSITORY_PORT) versions: DatasetVersionRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.exports = new DatasetExportService(manifests, versions);
  }

  @Post()
  @ApiOperation({ summary: 'Create a governed dataset export verification manifest' })
  @ApiBody({ type: CreateDatasetExportManifestDto })
  async create(
    @Req() request: unknown,
    @Body() input: CreateDatasetExportManifestDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.exports.create(context, input);
  }

  @Get(':manifestId')
  @ApiOperation({ summary: 'Read an immutable governed dataset export manifest' })
  async find(@Req() request: unknown, @Param('manifestId') manifestId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.exports.find(context, manifestId);
  }
}
