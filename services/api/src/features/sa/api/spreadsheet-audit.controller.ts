import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  SPREADSHEET_AUDIT_REPOSITORY_PORT,
  type SpreadsheetAuditRepositoryPortV1,
} from '../application/spreadsheet-audit-repository.port.js';
import { SpreadsheetAuditService } from '../application/spreadsheet-audit.service.js';
import { CreateSpreadsheetAuditResultDto } from './spreadsheet-audit.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('spreadsheet-audits')
@ApiBearerAuth()
@Controller('v1/spreadsheet-audits')
export class SpreadsheetAuditController {
  private readonly audits: SpreadsheetAuditService;

  public constructor(
    @Inject(SPREADSHEET_AUDIT_REPOSITORY_PORT) repository: SpreadsheetAuditRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.audits = new SpreadsheetAuditService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Register an immutable, value-free spreadsheet audit result' })
  @ApiBody({ type: CreateSpreadsheetAuditResultDto })
  async register(
    @Req() request: unknown,
    @Body() input: CreateSpreadsheetAuditResultDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.audits.register(context, { ...input, tenantScope: context.tenantScope });
  }

  @Get(':auditId')
  @ApiOperation({ summary: 'Read an exact immutable spreadsheet audit result' })
  async find(@Req() request: unknown, @Param('auditId') auditId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.audits.find(context, auditId);
  }

  @Get()
  @ApiOperation({ summary: 'List spreadsheet audit results for an exact artifact version' })
  async list(
    @Req() request: unknown,
    @Query('artifactVersionId') artifactVersionId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.audits.list(context, artifactVersionId);
  }
}
