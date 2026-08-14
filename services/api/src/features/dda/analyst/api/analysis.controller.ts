import {
  Body,
  Controller,
  Inject,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { AnalysisExecutionServiceV1 } from '../application/analysis-execution.service.js';
import { AnalysisProposalServiceV1 } from '../application/analysis-proposal.service.js';
import type { AnalysisProposeDtoV1, AnalysisExecuteDtoV1 } from './analysis.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

/** Thin HTTP surface; root composition remains owned by plan 087. */
@ApiTags('dda-analysis')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/analysis')
export class AnalysisControllerV1 {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly proposals: AnalysisProposalServiceV1,
    private readonly executions: AnalysisExecutionServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) throw new UnauthorizedException();
      throw new ServiceUnavailableException();
    }
  }

  @Post('propose')
  public async propose(@Req() request: unknown, @Body() body: AnalysisProposeDtoV1) {
    const context = await this.resolveContext(request);
    return this.proposals.propose(context, body.request);
  }

  @Post('execute')
  public async execute(@Req() request: unknown, @Body() body: AnalysisExecuteDtoV1) {
    const context = await this.resolveContext(request);
    return this.executions.execute(context, {
      plan: body.plan,
      narrativeClaims: body.narrativeClaims ?? [],
    });
  }
}
