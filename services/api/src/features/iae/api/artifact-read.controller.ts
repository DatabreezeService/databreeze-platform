import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import { ArtifactService } from '../application/artifact.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-006, IAE-008, IAE-019, IAE-020: content-free exact-version reads. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-versions')
export class ArtifactReadController {
  private readonly artifacts: ArtifactService;

  public constructor(
    @Inject(ARTIFACT_REPOSITORY_PORT) repository: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.artifacts = new ArtifactService(repository);
  }

  @Get(':versionId')
  @ApiOperation({ summary: 'Read immutable artifact-version metadata and placements' })
  async get(@Req() request: unknown, @Param('versionId') versionIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const result = await this.artifacts.find(context, versionId.value);
    if (!result.version) return { accepted: false, code: 'NOT_FOUND' as const };
    return Object.freeze({ accepted: true, value: result });
  }

  @Get(':versionId/evidence')
  @ApiOperation({ summary: 'List typed evidence references for one immutable version' })
  async evidence(
    @Req() request: unknown,
    @Param('versionId') versionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const result = await this.artifacts.find(context, versionId.value);
    if (!result.version) return { accepted: false, code: 'NOT_FOUND' as const };
    return Object.freeze({ accepted: true, value: result.evidence });
  }

  @Get(':versionId/evidence/:evidenceId/resolve')
  @ApiOperation({ summary: 'Resolve one exact evidence reference to a safe opaque action' })
  async resolveEvidence(
    @Req() request: unknown,
    @Param('versionId') versionIdInput: string,
    @Param('evidenceId') evidenceIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    const evidenceId = parseStableIdentifierV1(evidenceIdInput);
    if (!versionId.accepted || !evidenceId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const result = await this.artifacts.resolveEvidence(context, versionId.value, evidenceId.value);
    if (!result) return { accepted: false, code: 'NOT_FOUND' as const };
    return Object.freeze({ accepted: true, value: result });
  }
}
