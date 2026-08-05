import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { InvoiceLeakDetectorAuditService } from '../application/invoice-leak-detector-audit.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { AuditInvoiceLeakDetectorDto } from './invoice-leak-detector-audit.dto.js';

@ApiTags('invoice-leak-detector')
@ApiBearerAuth()
@Controller('v1/invoice-leak-detector')
export class InvoiceLeakDetectorAuditController {
  public constructor(
    private readonly auditService: InvoiceLeakDetectorAuditService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('ephemeral-audit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evaluate a bounded, non-persistent Invoice Leak Detector audit',
  })
  @ApiBody({ type: AuditInvoiceLeakDetectorDto })
  async audit(
    @Req() request: unknown,
    @Body() input: AuditInvoiceLeakDetectorDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.auditService.audit(context, input);
  }
}
