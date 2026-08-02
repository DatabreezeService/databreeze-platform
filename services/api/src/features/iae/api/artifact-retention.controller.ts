import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import {
  ARTIFACT_RETENTION_REPOSITORY_PORT,
  type ArtifactRetentionRepositoryPortV1,
} from '../application/artifact-retention-repository.port.js';
import { ArtifactRetentionService } from '../application/artifact-retention.service.js';
import {
  AuthorizeArtifactDeletionRequestDto,
  CreateArtifactDeletionRequestDto,
} from './artifact-retention.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1')
export class ArtifactRetentionController {
  private readonly retention: ArtifactRetentionService;

  public constructor(
    @Inject(ARTIFACT_RETENTION_REPOSITORY_PORT) requests: ArtifactRetentionRepositoryPortV1,
    @Inject(ARTIFACT_REPOSITORY_PORT) artifacts: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.retention = new ArtifactRetentionService(requests, artifacts);
  }

  @Get('artifact-deletion-requests/:requestId')
  @ApiOperation({ summary: 'Read one governed artifact deletion request' })
  async find(@Req() request: unknown, @Param('requestId') requestId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.retention.find(context, requestId);
  }

  @Post('artifact-versions/:versionId/deletion-requests')
  @ApiOperation({ summary: 'Request governed deletion of an exact artifact version' })
  @ApiBody({ type: CreateArtifactDeletionRequestDto })
  async request(
    @Req() request: unknown,
    @Param('versionId') versionId: string,
    @Body() input: CreateArtifactDeletionRequestDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.retention.request(context, {
      requestId: input.requestId,
      artifactVersionId: versionId,
      tenantScope: context.tenantScope,
      requestedBy: input.requestedBy,
      requestedAt: input.requestedAt,
      retention: input,
    });
  }

  @Post('artifact-deletion-requests/:requestId/authorize')
  @ApiOperation({ summary: 'Authorize an eligible deletion request after MFA step-up' })
  @ApiBody({ type: AuthorizeArtifactDeletionRequestDto })
  async authorize(
    @Req() request: unknown,
    @Param('requestId') requestId: string,
    @Body() input: AuthorizeArtifactDeletionRequestDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.retention.authorize(context, {
      requestId,
      retention: input,
      approvedAt: input.approvedAt,
      mfaSatisfied: input.mfaSatisfied,
      expectedRevision: input.expectedRevision,
    });
  }
}
