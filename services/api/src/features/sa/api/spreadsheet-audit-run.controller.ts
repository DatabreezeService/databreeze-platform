import { Body, Controller, Get, Inject, Optional, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT,
  type SpreadsheetAuditRunRepositoryPortV1,
} from '../application/spreadsheet-audit-run-repository.port.js';
import {
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../../iae/application/artifact-repository.port.js';
import { SpreadsheetAuditRunService } from '../application/spreadsheet-audit-run.service.js';
import { AdmitSpreadsheetAuditRunDto } from './spreadsheet-audit-run.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('spreadsheet-audit-runs')
@ApiBearerAuth()
@Controller('v1/spreadsheet-audit-runs')
export class SpreadsheetAuditRunController {
  private readonly runs: SpreadsheetAuditRunService;

  public constructor(
    @Inject(SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT)
    repository: SpreadsheetAuditRunRepositoryPortV1,
    @Optional()
    @Inject(ARTIFACT_REPOSITORY_PORT)
    artifactRepository: ArtifactRepositoryPortV1 | undefined,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.runs = new SpreadsheetAuditRunService(repository, artifactRepository);
  }

  @Post()
  @ApiOperation({ summary: 'Admit a content-free Spreadsheet Auditor run' })
  @ApiBody({ type: AdmitSpreadsheetAuditRunDto })
  async admit(
    @Req() request: unknown,
    @Body() input: AdmitSpreadsheetAuditRunDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.runs.admit(context, input);
  }

  @Get(':runId')
  @ApiOperation({ summary: 'Read a tenant-scoped Spreadsheet Auditor run handle' })
  async find(@Req() request: unknown, @Param('runId') runId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.runs.find(context, runId);
  }
}
