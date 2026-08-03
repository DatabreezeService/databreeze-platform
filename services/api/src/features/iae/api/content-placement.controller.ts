import { Body, Controller, Inject, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../application/artifact-repository.port.js';
import { ContentPlacementService } from '../application/content-placement.service.js';
import { UpdateContentPlacementDto } from './content-placement.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-versions')
export class ContentPlacementController {
  private readonly placements: ContentPlacementService;

  public constructor(
    @Inject(ARTIFACT_REPOSITORY_PORT) repository: ArtifactRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.placements = new ContentPlacementService(repository);
  }

  @Patch(':versionId/placements/:placementId')
  @ApiOperation({ summary: 'Update verified placement availability with a revision precondition' })
  @ApiBody({ type: UpdateContentPlacementDto })
  async update(
    @Req() request: unknown,
    @Param('versionId') versionId: string,
    @Param('placementId') placementId: string,
    @Body() input: UpdateContentPlacementDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.placements.setAvailability(context, {
      versionId,
      placementId,
      ...input,
    });
  }
}
