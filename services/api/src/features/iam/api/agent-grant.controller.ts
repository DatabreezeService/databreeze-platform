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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  IAM_AGENT_GRANT_SERVICE,
  type AgentGrantService,
} from '../application/agent-grant.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

const AGENT_LEVELS = [
  'NONE',
  'ANALYZE',
  'PROPOSE_CHANGES',
  'APPLY_CONFIRMED_CHANGES',
] as const;
const AGENT_GRANT_ERROR_CODES = [
  'INVALID_IDENTIFIER',
  'INVALID_LEVEL',
  'INVALID_SCOPE',
  'SCOPE_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'UNAVAILABLE',
] as const;

export class AgentGrantRejectedResponseDto {
  @ApiProperty({ enum: [false], example: false })
  accepted!: false;

  @ApiProperty({ enum: AGENT_GRANT_ERROR_CODES })
  code!: (typeof AGENT_GRANT_ERROR_CODES)[number];
}

export class SetAgentGrantDto {
  @ApiProperty({ enum: AGENT_LEVELS })
  @IsIn(AGENT_LEVELS)
  level!: (typeof AGENT_LEVELS)[number];

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class SetDatasetRestrictionsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  deniedDatasetIds!: string[];

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class AuthorizeAgentGrantDto {
  @ApiProperty({ enum: AGENT_LEVELS })
  @IsIn(AGENT_LEVELS)
  requestedLevel!: (typeof AGENT_LEVELS)[number];

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(32)
  @IsUUID('4', { each: true })
  resourceIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmationPresent?: boolean;
}

function grantStatus(result: unknown): number {
  if (typeof result !== 'object' || result === null || !('accepted' in result)) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  const candidate = result as { readonly accepted?: unknown; readonly code?: unknown };
  if (candidate.accepted === true) return HttpStatus.OK;
  switch (candidate.code) {
    case 'SCOPE_DENIED':
      return HttpStatus.FORBIDDEN;
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'CONFLICT':
      return HttpStatus.CONFLICT;
    case 'UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function preserveGrantStatus<TValue>(result: TValue, reply?: FastifyReply): TValue {
  reply?.code(grantStatus(result));
  return result;
}

function applyGrantOutcomeResponses(): MethodDecorator {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'The request is invalid.',
      type: AgentGrantRejectedResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'The authenticated actor lacks workspace settings authority.',
      type: AgentGrantRejectedResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'The member or restricted resource is not visible.',
      type: AgentGrantRejectedResponseDto,
    }),
    ApiConflictResponse({
      description: 'The grant revision conflicts.',
      type: AgentGrantRejectedResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'Agent grant persistence is unavailable.',
      type: AgentGrantRejectedResponseDto,
    }),
  );
}

/** IAM-024: owner-managed independent workspace agent grants and dataset restrictions. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1/workspaces/agent-grants')
export class AgentGrantController {
  public constructor(
    @Optional()
    @Inject(IAM_AGENT_GRANT_SERVICE)
    private readonly grants: AgentGrantService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private unavailable() {
    return { accepted: false as const, code: 'UNAVAILABLE' as const };
  }

  @Get(':memberId')
  @ApiOperation({ summary: 'Read one member agent grant or the policy default' })
  @ApiOkResponse({ description: 'The effective agent grant.' })
  @applyGrantOutcomeResponses()
  async getGrant(
    @Req() request: unknown,
    @Param('memberId') memberId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.grants
      ? await this.grants.getMemberGrant(context, { memberId })
      : this.unavailable();
    return preserveGrantStatus(result, reply);
  }

  @Post(':memberId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or replace one member agent grant' })
  @ApiBody({ type: SetAgentGrantDto })
  @ApiOkResponse({ description: 'The updated agent grant.' })
  @applyGrantOutcomeResponses()
  async setGrant(
    @Req() request: unknown,
    @Param('memberId') memberId: string,
    @Body() input: SetAgentGrantDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.grants
      ? await this.grants.setMemberGrant(context, {
          memberId,
          level: input.level,
          expectedRevision: input.expectedRevision,
        })
      : this.unavailable();
    return preserveGrantStatus(result, reply);
  }

  @Post(':memberId/dataset-restrictions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Replace sensitive dataset deny scopes for one member' })
  @ApiBody({ type: SetDatasetRestrictionsDto })
  @ApiOkResponse({ description: 'The updated dataset restrictions.' })
  @applyGrantOutcomeResponses()
  async setRestrictions(
    @Req() request: unknown,
    @Param('memberId') memberId: string,
    @Body() input: SetDatasetRestrictionsDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.grants
      ? await this.grants.setDatasetRestrictions(context, {
          memberId,
          deniedDatasetIds: input.deniedDatasetIds,
          expectedRevision: input.expectedRevision,
        })
      : this.unavailable();
    return preserveGrantStatus(result, reply);
  }

  @Post(':memberId/authorize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evaluate the effective agent level for requested resources' })
  @ApiBody({ type: AuthorizeAgentGrantDto })
  @ApiOkResponse({ description: 'The authorization decision.' })
  @applyGrantOutcomeResponses()
  async authorize(
    @Req() request: unknown,
    @Param('memberId') memberId: string,
    @Body() input: AuthorizeAgentGrantDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = this.grants
      ? await this.grants.authorize({
          context,
          memberId,
          requestedLevel: input.requestedLevel,
          resourceIds: input.resourceIds,
          ...(input.confirmationPresent === undefined
            ? {}
            : { confirmationPresent: input.confirmationPresent }),
        })
      : this.unavailable();
    return preserveGrantStatus(result, reply);
  }
}
