import { Body, Controller, Delete, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ARTIFACT_REPOSITORY_PORT, type ArtifactRepositoryPortV1 } from '../application/artifact-repository.port.js';
import { EVIDENCE_GRANT_REPOSITORY_PORT, type EvidenceGrantRepositoryPortV1 } from '../application/evidence-grant-repository.port.js';
import { EvidenceGrantService } from '../application/evidence-grant.service.js';
import { CreateEvidenceGrantDto } from './evidence-grant.dto.js';
import { REQUEST_TENANT_CONTEXT, type RequestTenantContextPortV1 } from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifacts')
export class EvidenceGrantController {
  private readonly grants: EvidenceGrantService;

  public constructor(
    @Inject(EVIDENCE_GRANT_REPOSITORY_PORT) grantRepository: EvidenceGrantRepositoryPortV1,
    @Inject(ARTIFACT_REPOSITORY_PORT) artifactRepository: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.grants = new EvidenceGrantService(grantRepository, artifactRepository);
  }

  @Post(':versionId/evidence/:evidenceId/grants')
  @ApiOperation({ summary: 'Issue a short-lived exact-evidence access grant' })
  @ApiBody({ type: CreateEvidenceGrantDto })
  async issue(@Req() request: unknown, @Param('versionId') versionId: string, @Param('evidenceId') evidenceId: string, @Body() input: CreateEvidenceGrantDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.grants.issueForEvidence(context, { ...input, versionId, evidenceId });
  }

  @Delete('/evidence-grants/:grantId')
  @ApiOperation({ summary: 'Revoke an evidence access grant' })
  async revoke(@Req() request: unknown, @Param('grantId') grantId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.grants.revoke(context, grantId);
  }
}
