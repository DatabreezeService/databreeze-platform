import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPortV1,
} from '../application/audit-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit')
export class AuditController {
  public constructor(
    @Inject(AUDIT_REPOSITORY_PORT) private readonly repository: AuditRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('events')
  @ApiOperation({ summary: 'List immutable audit events visible to the caller' })
  async events(@Req() request: unknown): Promise<readonly unknown[]> {
    const context = await this.requestContext.resolve(request);
    return this.repository.listEvents(context);
  }

  @Get('seals')
  @ApiOperation({ summary: 'List verified audit seals visible to the caller' })
  async seals(@Req() request: unknown): Promise<readonly unknown[]> {
    const context = await this.requestContext.resolve(request);
    return this.repository.listSeals(context);
  }
}
