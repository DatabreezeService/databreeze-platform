import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseV3Contract, type DdaDashboardChartProposal } from '@databreeze/contracts/v3';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import {
  DashboardProposalServiceV1,
  type DashboardProposalErrorCodeV1,
} from '../application/dashboard-proposal.service.js';
import { DashboardProposalRequestDtoV1 } from './dashboard-proposal.dto.js';

const AUTHORITY_FIELDS = new Set([
  'context',
  'authorizedFields',
  'authorizedMetrics',
  'resultShapes',
  'widgetAllowlist',
  'responsiveRules',
  'responsiveConstraints',
  'costBounds',
  'currentDashboardVersionId',
  'parentVersionId',
  'expectedRevision',
  'tenantScope',
  'actorId',
]);

function hasAuthorityField(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => AUTHORITY_FIELDS.has(key));
}

const PROPOSAL_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-chart-proposal';

function proposalProblem(code: DashboardProposalErrorCodeV1): HttpException {
  if (code === 'INVALID_INPUT') return new BadRequestException();
  if (
    code === 'UNAUTHORIZED' ||
    code === 'DASHBOARD_NOT_FOUND' ||
    code === 'ANALYSIS_PLAN_NOT_FOUND' ||
    code === 'TARGET_NOT_FOUND'
  ) {
    // An unauthorized subject is deliberately indistinguishable from an absent one.
    return new NotFoundException();
  }
  if (code === 'AI_EGRESS_DENIED' || code === 'PURPOSE_DENIED') {
    return new ForbiddenException();
  }
  if (code === 'BUDGET_DENIED') {
    return new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (
    code === 'AMBIGUOUS' ||
    code === 'UNSUPPORTED_WIDGET' ||
    code === 'INVALID_BINDING' ||
    code === 'HOSTILE_CONTENT_REJECTED' ||
    code === 'INVALID_PROPOSAL'
  ) {
    return new UnprocessableEntityException();
  }
  return new ServiceUnavailableException();
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v3/dda/dashboards')
export class DashboardProposalControllerV1 {
  readonly #requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly proposals: DashboardProposalServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.#requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post(':dashboardId/proposals')
  @ApiOperation({ summary: 'Generate permission-scoped preview chart proposals' })
  @ApiBody({ type: DashboardProposalRequestDtoV1 })
  @ApiOkResponse({
    description: 'Two to four compatible preview-only chart alternatives.',
    schema: { $ref: '#/components/schemas/DdaDashboardChartProposal' },
  })
  public async createProposal(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
    @Body() body: DashboardProposalRequestDtoV1,
  ): Promise<DdaDashboardChartProposal> {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasAuthorityField(body) ||
      hasAuthorityField(requestRecord?.['body']) ||
      hasAuthorityField(requestRecord?.['query']) ||
      hasAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
    let context;
    try {
      context = await this.#requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'AUTHENTICATION_UNAVAILABLE') throw new ServiceUnavailableException();
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
    let result;
    try {
      result = await this.proposals.propose(context, {
        dashboardId,
        question: body.question,
        analysisPlanVersionId: body.analysisPlanVersionId,
        targetPageId: body.targetPageId,
        ...(body.targetWidgetId === undefined ? {} : { targetWidgetId: body.targetWidgetId }),
        locale: body.locale,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throw proposalProblem(result.code);
    const parsed = parseV3Contract<DdaDashboardChartProposal>(PROPOSAL_SCHEMA_ID, result.value);
    if (!parsed.accepted) throw new ServiceUnavailableException();
    return Object.freeze(parsed.value);
  }

  @Get(':dashboardId/proposals/:proposalId')
  @ApiOperation({ summary: 'Read a permission-scoped preview chart proposal' })
  public async readProposal(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
    @Param('proposalId') proposalId: string,
  ) {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasAuthorityField(requestRecord?.['body']) ||
      hasAuthorityField(requestRecord?.['query']) ||
      hasAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
    let context;
    try {
      context = await this.#requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'AUTHENTICATION_UNAVAILABLE') throw new ServiceUnavailableException();
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
    let result;
    try {
      result = await this.proposals.read(context, { dashboardId, proposalId });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throw proposalProblem(result.code);
    return result.value;
  }
}
