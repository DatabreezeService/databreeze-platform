import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { ApprovalService } from '../application/approval.service.js';
import {
  APPROVAL_REPOSITORY_PORT,
  type ApprovalRepositoryPortV1,
} from '../application/approval-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  CreateApprovalPolicyDto,
  CreateApprovalRequestDto,
  DecideApprovalDto,
} from './approval.dto.js';
import { IAM_REPOSITORY_PORT } from '../../iam/application/iam-repository.port.js';
import type { IamRepositoryPortV1 } from '../../iam/application/iam-repository.port.js';
import type { ApprovalRequestStatusV1 } from '@databreeze/domain/approval/v1';

const APPROVAL_REQUEST_STATUSES = [
  'OPEN',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const satisfies readonly ApprovalRequestStatusV1[];

function parseApprovalStatus(value: string): ApprovalRequestStatusV1 | undefined {
  return (APPROVAL_REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as ApprovalRequestStatusV1)
    : undefined;
}

function fail(code: string, forcedStatus?: HttpStatus): never {
  const status =
    forcedStatus ??
    (code.includes('MFA')
      ? HttpStatus.FORBIDDEN
      : code === 'REQUEST_NOT_OPEN'
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST);
  throw new HttpException({ error: 'JRA_APPROVAL_REJECTED', code }, status);
}

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('v1/approvals')
export class ApprovalController {
  public constructor(
    private readonly approval: ApprovalService,
    @Inject(APPROVAL_REPOSITORY_PORT) private readonly repository: ApprovalRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
    @Optional() @Inject(IAM_REPOSITORY_PORT) private readonly iam?: IamRepositoryPortV1,
  ) {}

  @Get('requests')
  @ApiOperation({ summary: 'List tenant-scoped approval requests for the authenticated actor' })
  @ApiOkResponse({
    schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
  })
  async list(@Req() request: unknown, @Query('status') status?: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsedStatuses =
      status === undefined ? undefined : status.split(',').filter(Boolean).map(parseApprovalStatus);
    if (parsedStatuses?.some((value) => value === undefined)) fail('INVALID_STATUS');
    const statuses = parsedStatuses?.filter(
      (value): value is ApprovalRequestStatusV1 => value !== undefined,
    );
    return this.repository.withTransaction(context, (tx) =>
      tx.findRequests(context, statuses ? { statuses } : undefined),
    );
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Read one tenant-scoped approval request and its decisions' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['request', 'decisions'],
      properties: {
        request: { type: 'object', additionalProperties: true },
        decisions: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  })
  async get(@Req() request: unknown, @Param('requestId') requestId: string): Promise<unknown> {
    if (!parseStableIdentifierV1(requestId).accepted) fail('INVALID_IDENTIFIER');
    const context = await this.requestContext.resolve(request);
    const parsedId = parseStableIdentifierV1(requestId);
    if (!parsedId.accepted) fail('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (tx) => {
      const value = await tx.findRequest(context, parsedId.value);
      if (!value) throw new HttpException({ error: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
      return { request: value, decisions: await tx.listDecisions(context, value.requestId) };
    });
  }

  @Post('policies')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CreateApprovalPolicyDto })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async publishPolicy(
    @Req() request: unknown,
    @Body() input: CreateApprovalPolicyDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = await this.approval.publishPolicy(context, input);
    if (!result.accepted) fail(result.code);
    return result.value;
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CreateApprovalRequestDto })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async openRequest(
    @Req() request: unknown,
    @Body() input: CreateApprovalRequestDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    if (input.requestedBy !== context.actorId) fail('REQUEST_ACTOR_MISMATCH');
    const result = await this.approval.openRequest(context, input);
    if (!result.accepted) fail(result.code);
    return result.value;
  }

  @Post('requests/:requestId/decisions')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: DecideApprovalDto })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async decide(
    @Req() request: unknown,
    @Param('requestId') requestId: string,
    @Body() input: DecideApprovalDto,
  ): Promise<unknown> {
    if (input.mfaAssertionId.length === 0 || !parseStableIdentifierV1(requestId).accepted)
      fail('INVALID_IDENTIFIER');
    const context = await this.requestContext.resolve(request);
    const actor = this.iam ? await this.iam.findMembership(context, context.actorId) : undefined;
    if (!actor || actor.roleId !== input.actorRole)
      fail('ACTOR_ROLE_MISMATCH', HttpStatus.FORBIDDEN);
    const parsedId = parseStableIdentifierV1(requestId);
    if (!parsedId.accepted) fail('INVALID_IDENTIFIER');
    const result = await this.approval.decide(context, {
      ...input,
      requestId: parsedId.value,
      actorId: context.actorId,
    });
    if (!result.accepted) fail(result.code);
    return result.value;
  }
}
