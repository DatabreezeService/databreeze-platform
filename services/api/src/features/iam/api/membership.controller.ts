import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  TransferOwnershipDto,
  TransitionMembershipDto,
} from './membership.dto.js';

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
  async list(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.memberships?.list(context) ?? this.unavailable();
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Invite a principal with a bounded role and tenant scope' })
  @ApiBody({ type: InviteMembershipDto })
  async invite(@Req() request: unknown, @Body() input: InviteMembershipDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.memberships?.invite(context, input) ?? this.unavailable();
  }

  @Post(':membershipId/transition')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transition one membership with an optimistic revision' })
  @ApiBody({ type: TransitionMembershipDto })
  async transition(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: TransitionMembershipDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return (
      this.memberships?.transition(context, membershipId, input.expectedRevision, input.status) ??
      this.unavailable()
    );
  }

  @Post(':membershipId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invitation as the invited principal' })
  @ApiBody({ type: AcceptMembershipDto })
  async accept(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: AcceptMembershipDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return (
      this.memberships?.accept(context, membershipId, input.expectedRevision) ?? this.unavailable()
    );
  }

  @Post(':membershipId/transfer-ownership')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transfer organization ownership to an active member' })
  @ApiBody({ type: TransferOwnershipDto })
  async transferOwnership(
    @Req() request: unknown,
    @Param('membershipId') membershipId: string,
    @Body() input: TransferOwnershipDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return (
      this.memberships?.transferOwnership(context, membershipId, input.expectedRevision) ??
      this.unavailable()
    );
  }
}
