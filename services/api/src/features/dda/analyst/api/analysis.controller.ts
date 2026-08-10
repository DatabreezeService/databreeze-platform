import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { AnalysisExecutionServiceV1 } from '../application/analysis-execution.service.js';
import { AnalysisProposalServiceV1 } from '../application/analysis-proposal.service.js';
import type { AnalysisProposeDtoV1, AnalysisExecuteDtoV1 } from './analysis.dto.js';

/** Thin HTTP surface; root composition remains owned by plan 087. */
@ApiTags('dda-analysis')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/analysis')
export class AnalysisControllerV1 {
  public constructor(
    private readonly proposals: AnalysisProposalServiceV1,
    private readonly executions: AnalysisExecutionServiceV1,
  ) {}

  @Post('propose')
  public async propose(@Body() body: AnalysisProposeDtoV1) {
    return this.proposals.propose(body.context, body.request);
  }

  @Post('execute')
  public async execute(@Body() body: AnalysisExecuteDtoV1) {
    return this.executions.execute(body.context, {
      plan: body.plan,
      narrativeClaims: body.narrativeClaims ?? [],
    });
  }
}
