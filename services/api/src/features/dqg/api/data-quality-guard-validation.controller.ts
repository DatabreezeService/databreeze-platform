import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DataQualityGuardValidationService } from '../application/data-quality-guard-validation.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { ValidateDataQualityGuardDto } from './data-quality-guard-validation.dto.js';

@ApiTags('data-quality-guard')
@ApiBearerAuth()
@Controller('v1/data-quality-guard')
export class DataQualityGuardValidationController {
  public constructor(
    private readonly validation: DataQualityGuardValidationService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('ephemeral-validation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evaluate a bounded, non-persistent Data Quality Guard validation request',
  })
  @ApiBody({ type: ValidateDataQualityGuardDto })
  async validate(
    @Req() request: unknown,
    @Body() input: ValidateDataQualityGuardDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.validation.validate(context, input);
  }
}
