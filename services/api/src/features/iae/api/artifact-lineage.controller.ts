import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ARTIFACT_LINEAGE_REPOSITORY_PORT,
  type ArtifactLineageRepositoryPortV1,
} from '../application/artifact-lineage-repository.port.js';
import { ArtifactGovernanceService } from '../application/artifact-governance.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-007: lineage is addressable by exact derived and source versions. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-versions')
export class ArtifactLineageController {
  private readonly governance: ArtifactGovernanceService;

  public constructor(
    @Inject(ARTIFACT_LINEAGE_REPOSITORY_PORT) repository: ArtifactLineageRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.governance = new ArtifactGovernanceService(repository);
  }

  @Get(':versionId/lineage')
  @ApiOperation({ summary: 'Read lineage for an exact derived artifact version' })
  async forDerived(
    @Req() request: unknown,
    @Param('versionId') versionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    const lineage = await this.governance.findForDerived(context, versionId.value);
    return lineage
      ? Object.freeze({ accepted: true, value: lineage })
      : Object.freeze({ accepted: false, code: 'NOT_FOUND' as const });
  }

  @Get(':versionId/derived-lineage')
  @ApiOperation({ summary: 'List derived versions that use an exact source version' })
  async forSource(
    @Req() request: unknown,
    @Param('versionId') versionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const versionId = parseStableIdentifierV1(versionIdInput);
    if (!versionId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return Object.freeze({
      accepted: true,
      value: await this.governance.listForSource(context, versionId.value),
    });
  }
}
