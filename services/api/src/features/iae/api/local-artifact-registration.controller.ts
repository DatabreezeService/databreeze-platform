import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import { ArtifactService } from '../application/artifact.service.js';
import { RegisterLocalArtifactDto } from './local-artifact-registration.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-001/004/006/019: register a Desktop-local artifact without paths, bytes, or excerpts. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-versions')
export class LocalArtifactRegistrationController {
  private readonly artifacts: ArtifactService;

  public constructor(
    @Inject(ARTIFACT_REPOSITORY_PORT) repository: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.artifacts = new ArtifactService(repository);
  }

  @Post('local')
  @ApiOperation({
    summary: 'Register a Desktop-local artifact with content-free metadata and opaque evidence',
  })
  @ApiBody({ type: RegisterLocalArtifactDto })
  async register(
    @Req() request: unknown,
    @Body() input: RegisterLocalArtifactDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.artifacts.registerLocal(context, input);
  }
}
