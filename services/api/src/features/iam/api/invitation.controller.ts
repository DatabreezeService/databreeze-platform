import { Body, Controller, HttpCode, Inject, Optional, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  IAM_INVITATION_SERVICE,
  type IamInvitationApplicationResultV1,
  type IamInvitationService,
} from '../application/invitation.service.js';
import { InvitationProblemError } from '../application/invitation-problem.error.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  AcceptInvitationDto,
  InvitationRejectedResponseDto,
  IssueInvitationDto,
} from './invitation.dto.js';

function invitationError<TValue>(result: IamInvitationApplicationResultV1<TValue>): TValue {
  if (result.accepted) return result.value;
  switch (result.code) {
    case 'SCOPE_DENIED':
      throw new InvitationProblemError('INVITATION_SCOPE_DENIED');
    case 'NOT_FOUND':
      throw new InvitationProblemError('INVITATION_NOT_FOUND');
    case 'CONFLICT':
      throw new InvitationProblemError('INVITATION_CONFLICT');
    case 'DELIVERY_UNAVAILABLE':
      throw new InvitationProblemError('INVITATION_DELIVERY_UNAVAILABLE');
    case 'UNAVAILABLE':
      throw new InvitationProblemError('INVITATION_UNAVAILABLE');
    default:
      throw new InvitationProblemError('INVITATION_REQUEST_REJECTED');
  }
}

/** IAM-010: invitation bearer material is accepted only in a write body and never returned. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1/invitations')
export class IamInvitationController {
  public constructor(
    @Optional()
    @Inject(IAM_INVITATION_SERVICE)
    private readonly invitations: IamInvitationService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private requireService(): IamInvitationService {
    if (this.invitations === undefined) throw new InvitationProblemError('INVITATION_UNAVAILABLE');
    return this.invitations;
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create or reissue a single-use invitation for an existing principal',
  })
  @ApiBody({ type: IssueInvitationDto })
  @ApiOkResponse({ description: 'Invitation metadata without bearer material.' })
  @ApiBadRequestResponse({ type: InvitationRejectedResponseDto })
  @ApiForbiddenResponse({ type: InvitationRejectedResponseDto })
  @ApiNotFoundResponse({ type: InvitationRejectedResponseDto })
  @ApiConflictResponse({ type: InvitationRejectedResponseDto })
  @ApiServiceUnavailableResponse({ type: InvitationRejectedResponseDto })
  async issue(@Req() request: unknown, @Body() input: IssueInvitationDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const service = this.requireService();
    const result =
      input.membershipId === undefined
        ? service.issueForEmail(context, {
            recipientEmail: input.recipientEmail,
            accessPreset: input.accessPreset,
          })
        : service.issue(context, {
            membershipId: input.membershipId,
            recipientEmail: input.recipientEmail,
          });
    return invitationError(await result);
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Redeem a single-use invitation token for the authenticated principal' })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiOkResponse({ description: 'Activated membership metadata.' })
  @ApiBadRequestResponse({ type: InvitationRejectedResponseDto })
  @ApiForbiddenResponse({ type: InvitationRejectedResponseDto })
  @ApiNotFoundResponse({ type: InvitationRejectedResponseDto })
  @ApiConflictResponse({ type: InvitationRejectedResponseDto })
  @ApiServiceUnavailableResponse({ type: InvitationRejectedResponseDto })
  async accept(@Req() request: unknown, @Body() input: AcceptInvitationDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return invitationError(await this.requireService().accept(context, input.token));
  }
}
