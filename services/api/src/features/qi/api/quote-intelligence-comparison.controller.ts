import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { QuoteIntelligenceComparisonService } from '../application/quote-intelligence-comparison.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { CompareQuoteIntelligenceDto } from './quote-intelligence-comparison.dto.js';

@ApiTags('quote-intelligence')
@ApiBearerAuth()
@Controller('v1/quote-intelligence')
export class QuoteIntelligenceComparisonController {
  public constructor(
    private readonly comparison: QuoteIntelligenceComparisonService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('ephemeral-comparison')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evaluate a bounded, non-persistent Quote Intelligence comparison',
  })
  @ApiBody({ type: CompareQuoteIntelligenceDto })
  async compare(
    @Req() request: unknown,
    @Body() input: CompareQuoteIntelligenceDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.comparison.compare(context, input);
  }
}
