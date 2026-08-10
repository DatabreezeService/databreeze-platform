import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DashboardDraftServiceV1 } from '../application/dashboard-draft.service.js';
import type {
  AcceptDashboardProposalDtoV1,
  ApplyDashboardFilterDtoV1,
  RestoreDashboardWidgetDtoV1,
} from './dashboard.dto.js';

@ApiTags('dda-dashboard-draft')
@Controller('v1/dda/dashboards/draft')
export class DashboardDraftControllerV1 {
  public constructor(private readonly drafts: DashboardDraftServiceV1) {}

  @Post('accept')
  public async accept(@Body() body: AcceptDashboardProposalDtoV1) {
    return this.drafts.acceptProposal(body.context, {
      proposalId: body.proposalId,
      version: body.version,
      ...(body.proposalSummary === undefined ? {} : { proposalSummary: body.proposalSummary }),
    });
  }

  @Post('restore-widget')
  public async restore(@Body() body: RestoreDashboardWidgetDtoV1) {
    return this.drafts.restoreWidget(body.context, body);
  }

  @Post('filter')
  public async filter(@Body() body: ApplyDashboardFilterDtoV1) {
    return this.drafts.applyFilter(body.context, body);
  }
}
