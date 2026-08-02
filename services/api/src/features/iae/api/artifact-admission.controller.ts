import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import { ArtifactAdmissionService } from '../application/artifact-admission.service.js';
import { AdmitArtifactDto } from './artifact-admission.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-009/010: admission accepts verifier metadata, never source bytes or executable content. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-versions')
export class ArtifactAdmissionController {
  private readonly admission: ArtifactAdmissionService;

  public constructor(
    @Inject(ARTIFACT_REPOSITORY_PORT) repository: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.admission = new ArtifactAdmissionService(repository);
  }

  @Post(':versionId/admit')
  @ApiOperation({
    summary: 'Admit an exact artifact version after digest, media, size, and scan checks',
  })
  @ApiBody({ type: AdmitArtifactDto })
  async admit(
    @Req() request: unknown,
    @Param('versionId') versionIdInput: string,
    @Body() input: AdmitArtifactDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.admission.admit(context, versionId.value, input);
  }
}
