import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  IAM_MEMBERSHIP_SERVICE,
  type IamMembershipService,
} from '../application/membership.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  AcceptMembershipDto,
  InviteMembershipDto,
  MembershipRejectedResponseDto,
  TransferOwnershipDto,
  TransitionMembershipDto,
} from './membership.dto.js';

function membershipStatus(result: unknown): number {
  if (typeof result !== 'object' || result === null || !('accepted' in result))
    return HttpStatus.SERVICE_UNAVAILABLE;
  const candidate = result as { readonly accepted?: unknown; readonly code?: unknown };
  if (candidate.accepted === true) return HttpStatus.OK;
  switch (candidate.code) {
    case 'SCOPE_DENIED':
      return HttpStatus.FORBIDDEN;
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'CONFLICT':
    case 'LAST_OWNER':
      return HttpStatus.CONFLICT;
    case 'EXPIRED':
      return HttpStatus.GONE;
    case 'UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function preserveMembershipStatus<TValue>(result: TValue, reply?: FastifyReply): TValue {
  reply?.code(membershipStatus(result));
  return result;
}

function applyMembershipOutcomeResponses(): MethodDecorator {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'The request is invalid.',
      type: MembershipRejectedResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'The authenticated actor lacks the required scope.',
      type: MembershipRejectedResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'The membership is not visible.',
      type: MembershipRejectedResponseDto,
    }),
    ApiConflictResponse({
      description: 'The membership revision or ownership invariant conflicts.',
      type: MembershipRejectedResponseDto,
    }),
    ApiGoneResponse({
      description: 'The invitation has expired.',
      type: MembershipRejectedResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'Membership persistence is unavailable.',
      type: MembershipRejectedResponseDto,
    }),
  );
}

/** IAM-004: membership administration never accepts client-selected authority. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1/memberships')
export class IamMembershipController {
  public constructor(
    @Optional()
    @Inject(IAM_MEMBERSHIP_SERVICE)
    private readonly memberships: IamMembershipService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private unavailable() {
    return { accepted: false as const, code: 'UNAVAILABLE' as const };
  }

  @Get()
  @ApiOperation({ summary: 'List memberships visible in the authenticated tenant scope' })
  @ApiOkResponse({ description: 'The membership list.' })
  @applyMembershipOutcomeResponses()
  async list(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.memberships ? await this.memberships.list(context) : this.unavailable();
    return preserveMembershipStatus(result, reply);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Invite a principal with a bounded role and tenant scope' })
  @ApiBody({ type: InviteMembershipDto })
  @ApiOkResponse({ description: 'The invited membership.' })
  @applyMembershipOutcomeResponses()
  async invite(
    @Req() request: unknown,
    @Body() input: InviteMembershipDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.memberships
      ? await this.memberships.invite(context, input)
      : this.unavailable();
    return preserveMembershipStatus(result, reply);
  }

  @Post(':membershipId/transition')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transition one membership with an optimistic revision' })
  @ApiBody({ type: TransitionMembershipDto })
  @ApiOkResponse({ description: 'The transitioned membership.' })
  @applyMembershipOutcomeResponses()
  async transition(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: TransitionMembershipDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.memberships
      ? await this.memberships.transition(
          context,
          membershipId,
          input.expectedRevision,
          input.status,
        )
      : this.unavailable();
    return preserveMembershipStatus(result, reply);
  }

  @Post(':membershipId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invitation as the invited principal' })
  @ApiBody({ type: AcceptMembershipDto })
  @ApiOkResponse({ description: 'The accepted membership.' })
  @applyMembershipOutcomeResponses()
  async accept(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: AcceptMembershipDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.memberships
      ? await this.memberships.accept(context, membershipId, input.expectedRevision)
      : this.unavailable();
    return preserveMembershipStatus(result, reply);
  }

  @Post(':membershipId/transfer-ownership')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transfer organization ownership to an active member' })
  @ApiBody({ type: TransferOwnershipDto })
  @ApiOkResponse({ description: 'The transferred membership.' })
  @applyMembershipOutcomeResponses()
  async transferOwnership(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: TransferOwnershipDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.memberships
      ? await this.memberships.transferOwnership(context, membershipId, input.expectedRevision)
      : this.unavailable();
    return preserveMembershipStatus(result, reply);
  }
}
