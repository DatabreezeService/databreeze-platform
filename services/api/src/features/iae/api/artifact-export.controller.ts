import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import { ArtifactService } from '../application/artifact.service.js';
import {
  ARTIFACT_LINEAGE_REPOSITORY_PORT,
  type ArtifactLineageRepositoryPortV1,
} from '../application/artifact-lineage-repository.port.js';
import {
  ARTIFACT_EXPORT_REPOSITORY_PORT,
  type ArtifactExportRepositoryPortV1,
} from '../application/artifact-export-repository.port.js';
import { ArtifactExportService } from '../application/artifact-export.service.js';
import { CreateArtifactExportDto } from './artifact-export.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifacts/exports')
export class ArtifactExportController {
  private readonly exports: ArtifactExportService;

  public constructor(
    @Inject(ARTIFACT_EXPORT_REPOSITORY_PORT) manifests: ArtifactExportRepositoryPortV1,
    @Inject(ARTIFACT_REPOSITORY_PORT) artifacts: ArtifactRepositoryPortV1,
    @Inject(ARTIFACT_LINEAGE_REPOSITORY_PORT) lineage: ArtifactLineageRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.exports = new ArtifactExportService(manifests, new ArtifactService(artifacts), lineage);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable artifact verification manifest' })
  @ApiBody({ type: CreateArtifactExportDto })
  async create(@Req() request: unknown, @Body() input: CreateArtifactExportDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.exports.create(context, input);
  }

  @Get(':manifestId')
  @ApiOperation({ summary: 'Read an immutable artifact verification manifest' })
  async get(@Req() request: unknown, @Param('manifestId') manifestId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.exports.find(context, manifestId);
  }
}
