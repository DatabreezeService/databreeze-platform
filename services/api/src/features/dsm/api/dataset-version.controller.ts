import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DATASET_VERSION_REPOSITORY_PORT,
  type DatasetVersionRepositoryPortV1,
} from '../application/dataset-version-repository.port.js';
import { DatasetVersionService } from '../application/dataset-version.service.js';
import { RegisterDatasetVersionDto } from './dataset-version.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/dataset-versions')
export class DatasetVersionController {
  private readonly versions: DatasetVersionService;

  public constructor(
    @Inject(DATASET_VERSION_REPOSITORY_PORT) repository: DatasetVersionRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.versions = new DatasetVersionService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Register an immutable dataset result manifest' })
  @ApiBody({ type: RegisterDatasetVersionDto })
  async register(
    @Req() request: unknown,
    @Body() input: RegisterDatasetVersionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.versions.register(context, {
      ...input,
      tenantScope: context.tenantScope,
      contentFingerprint: input.contentFingerprint,
      lineageManifestHash: input.lineageManifestHash,
    });
  }

  @Get(':versionId')
  @ApiOperation({ summary: 'Read an exact immutable dataset result manifest' })
  async get(@Req() request: unknown, @Param('versionId') versionIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.versions.find(context, versionId.value);
  }
}
