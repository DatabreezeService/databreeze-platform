import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

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
  DashboardAuthoringCommandDtoV1,
  RestoreDashboardWidgetDtoV1,
} from './dashboard.dto.js';

@ApiTags('dda-dashboard-draft')
@ApiTags('dda')
@ApiBearerAuth()
@Controller()
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

  @Get('v1/dda/dashboards/:dashboardId/draft')
  public async getDraft(@Req() request: unknown, @Param('dashboardId') dashboardId: string) {
    const context = await this.resolveContext(request, true);
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

  @Post('v3/dda/dashboards/:dashboardId/authoring-commands')
  @ApiBody({
    schema: { $ref: '#/components/schemas/DdaDashboardAuthoringCommand' },
  })
  @ApiCreatedResponse({
    description: 'The persisted, non-publication authoring command result.',
    schema: { $ref: '#/components/schemas/DdaDashboardAuthoringCommandResult' },
  })
  public async authoringCommand(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
    @Body() body: DashboardAuthoringCommandDtoV1,
  ) {
    const context = await this.resolveContext(request, false);
    const untrusted = body as unknown as Record<string, unknown>;
    // The command schema is deliberately closed. Tenant authority, complete versions,
    // canonical hashes, values, and publication controls never come from the browser.
    if (
      body === null ||
      typeof body !== 'object' ||
      Object.prototype.hasOwnProperty.call(untrusted, 'context') ||
      body.dashboardId !== dashboardId
    ) {
      throw new BadRequestException({ code: 'INVALID_COMMAND' });
    }
    const result = await this.drafts.applyAuthoringCommand(context, body);
    if (result.accepted) return result.value;
    this.throwAuthoringFailure(result.code);
  }

  @Post('v1/dda/dashboards/draft/accept')
  public async accept(@Req() request: unknown, @Body() body: AcceptDashboardProposalDtoV1) {
    await this.resolveContext(request, false);
    // Deprecated alias: complete client-supplied versions are no longer accepted.
    // Use POST /:dashboardId/authoring-commands with ACCEPT_PROPOSAL instead.
    void body;
    throw new BadRequestException({ code: 'INVALID_COMMAND' });
  }

  @Post('v1/dda/dashboards/draft/restore-widget')
  public async restore(@Req() request: unknown, @Body() body: RestoreDashboardWidgetDtoV1) {
    await this.resolveContext(request, false);
    // Deprecated alias. Restores must carry expectedRevision and expectedVersionId
    // through the generated RESTORE_WIDGET authoring command.
    void body;
    throw new BadRequestException({ code: 'INVALID_COMMAND' });
  }

  @Post('v1/dda/dashboards/draft/filter')
  public async filter(@Req() request: unknown, @Body() body: ApplyDashboardFilterDtoV1) {
    await this.resolveContext(request, false);
    // Deprecated alias. Filters are presentation state until a versioned filter
    // command is accepted; legacy unrevisioned definition mutation is forbidden.
    void body;
    throw new BadRequestException({ code: 'INVALID_COMMAND' });
  }

  private async resolveContext(request: unknown, distinguishUnauthorized: boolean) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (distinguishUnauthorized && error instanceof RequestTenantContextProblemError) {
        throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAUTHORIZED');
      }
      throw new DashboardDraftProblemError('DASHBOARD_DRAFT_UNAVAILABLE');
    }
  }

  private throwAuthoringFailure(code: string): never {
    if (code === 'REVISION_CONFLICT' || code === 'COMMAND_CONFLICT') {
      throw new ConflictException({ code: 'REVISION_CONFLICT' });
    }
    if (code === 'NOT_FOUND' || code === 'WIDGET_NOT_FOUND') {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    if (code === 'UNAUTHORIZED') throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    if (code === 'UNAVAILABLE') throw new ServiceUnavailableException({ code: 'UNAVAILABLE' });
    if (code === 'INVALID_SELECTION') {
      throw new UnprocessableEntityException({ code: 'INVALID_PROPOSAL' });
    }
    throw new BadRequestException({ code });
  }
}
