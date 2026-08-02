import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DATASET_PROFILE_REPOSITORY_PORT,
  type DatasetProfileRepositoryPortV1,
} from '../application/dataset-profile-repository.port.js';
import { DatasetProfileService } from '../application/dataset-profile.service.js';
import { RegisterDatasetProfileDto } from './dataset-profile.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/dataset-profiles')
export class DatasetProfileController {
  private readonly profiles: DatasetProfileService;

  public constructor(
    @Inject(DATASET_PROFILE_REPOSITORY_PORT) repository: DatasetProfileRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.profiles = new DatasetProfileService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Register an immutable, value-free dataset profile disclosure' })
  @ApiBody({ type: RegisterDatasetProfileDto })
  async register(
    @Req() request: unknown,
    @Body() input: RegisterDatasetProfileDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.profiles.register(context, { ...input, tenantScope: context.tenantScope });
  }

  @Get(':profileId')
  @ApiOperation({ summary: 'Read an exact immutable dataset profile disclosure' })
  async get(@Req() request: unknown, @Param('profileId') profileIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const profileId = parseStableIdentifierV1(profileIdInput);
    if (!profileId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.profiles.find(context, profileId.value);
  }

  @Get()
  @ApiOperation({ summary: 'List profile disclosures for one exact dataset version' })
  async list(
    @Req() request: unknown,
    @Query('datasetVersionId') datasetVersionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetVersionId = parseStableIdentifierV1(datasetVersionIdInput);
    if (!datasetVersionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.profiles.list(context, datasetVersionId.value);
  }
}
