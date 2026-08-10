import { Body, Controller, Get, Inject, Optional, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import { DashboardDraftProblemError } from '../application/dashboard-draft-problem.error.js';
import { DashboardDraftServiceV1 } from '../application/dashboard-draft.service.js';
import type {
  AcceptDashboardProposalDtoV1,
  ApplyDashboardFilterDtoV1,
  RestoreDashboardWidgetDtoV1,
} from './dashboard.dto.js';

@ApiTags('dda-dashboard-draft')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardDraftControllerV1 {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly drafts: DashboardDraftServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Get(':dashboardId/draft')
  public async getDraft(@Req() request: unknown, @Param('dashboardId') dashboardId: string) {
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAUTHORIZED');
      }
      throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAVAILABLE');
    }
    const result = await this.drafts.readCurrentDraft(context, dashboardId);
    if (!result.accepted) {
      if (result.code === 'UNAUTHORIZED') {
        throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAUTHORIZED');
      }
      if (result.code === 'NOT_FOUND') {
        throw new DashboardDraftProblemError('DASHBOARD_DRAFT_NOT_FOUND');
      }
      throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAVAILABLE');
    }
    return result.value;
  }

  @Post('draft/accept')
  public async accept(@Body() body: AcceptDashboardProposalDtoV1) {
    return this.drafts.acceptProposal(body.context, {
      proposalId: body.proposalId,
      version: body.version,
      ...(body.proposalSummary === undefined ? {} : { proposalSummary: body.proposalSummary }),
    });
  }

  @Post('draft/restore-widget')
  public async restore(@Body() body: RestoreDashboardWidgetDtoV1) {
    return this.drafts.restoreWidget(body.context, body);
  }

  @Post('draft/filter')
  public async filter(@Body() body: ApplyDashboardFilterDtoV1) {
    return this.drafts.applyFilter(body.context, body);
  }
}
