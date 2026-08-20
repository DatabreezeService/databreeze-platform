import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  parseV4Contract,
  type DdaAgentTurnAccepted,
  type DdaAgentTurnCommand,
} from '@databreeze/contracts/v4';
import type { FastifyReply } from 'fastify';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import { AgentTurnService } from '../application/agent-turn.service.js';
import type { AgentTurnProblemCodeV1 } from '../application/agent-tool.types.js';
import { AgentDeterministicToolRequestDtoV1, AgentTurnRequestDtoV1 } from './agent-turn.dto.js';

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'memberAuthorized',
  'agentLevel',
  'effectiveAgentLevel',
  'accessPreset',
  'deniedDatasetIds',
  'requiredIamAction',
  'authorization',
  'memberId',
  'actorId',
  'organizationId',
  'workspaceId',
  'authorized',
]);

function hasClientAuthorityField(value: unknown, depth = 0): boolean {
  if (depth > 4 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasClientAuthorityField(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthorityField(child, depth + 1),
  );
}

function contractCommand(body: AgentTurnRequestDtoV1): Readonly<Record<string, unknown>> {
  const candidate: Record<string, unknown> = { ...body };
  if (candidate['contextRevision'] === undefined) delete candidate['contextRevision'];
  if (candidate['expectedContextRevision'] === undefined) {
    delete candidate['expectedContextRevision'];
  }
  return candidate;
}

const SAFE_AGENT_TURN_ERROR = Object.freeze({ error: 'AGENT_TURN_REJECTED' });
const AGENT_TURN_COMMAND_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-agent-turn-command' as const;
const AGENT_TURN_ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-agent-turn-accepted' as const;

/** Maps agent outcomes to safe HTTP semantics without exposing authority details. */
export function agentTurnProblemStatus(code: AgentTurnProblemCodeV1): HttpStatus {
  if (
    code === 'UNAUTHORIZED' ||
    code === 'INSUFFICIENT_AGENT_LEVEL' ||
    code === 'DATASET_RESTRICTED' ||
    code === 'EVIDENCE_UNAUTHORIZED'
  ) {
    return HttpStatus.FORBIDDEN;
  }
  if (code === 'CONVERSATION_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'BUDGET_DENIED') return HttpStatus.TOO_MANY_REQUESTS;
  if (code === 'PROVIDER_DISABLED' || code === 'PROVIDER_TIMEOUT' || code === 'PROVIDER_FAILURE') {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  if (code === 'STALE_CONTEXT') return HttpStatus.CONFLICT;
  if (
    code === 'OVER_BOUND_SAMPLE' ||
    code === 'TOOL_LOOP_LIMIT' ||
    code === 'REPEATED_TOOL_CALL' ||
    code === 'UNCONFIRMED_DASHBOARD_APPLY'
  ) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  return HttpStatus.BAD_REQUEST;
}

export class AgentTurnProblemError extends HttpException {
  public constructor(public readonly code: AgentTurnProblemCodeV1) {
    super(SAFE_AGENT_TURN_ERROR, agentTurnProblemStatus(code));
    this.name = 'AgentTurnProblemError';
  }
}

export type AgentTurnHttpRequestV1 = AgentTurnRequestDtoV1;
export type AgentDeterministicToolHttpRequestV1 = AgentDeterministicToolRequestDtoV1;

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/agent')
export class AgentTurnController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly service: AgentTurnService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post('turns')
  public async runTurn(
    @Req() request: unknown,
    @Body() body: AgentTurnRequestDtoV1,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    this.rejectClientAuthority(body, request);
    const parsedCommand = parseV4Contract<DdaAgentTurnCommand>(
      AGENT_TURN_COMMAND_SCHEMA_ID,
      contractCommand(body),
    );
    if (!parsedCommand.accepted) throw new BadRequestException();
    const command = parsedCommand.value;
    const context = await this.resolveContext(request);
    const result = await this.service.runTurn({
      context,
      conversationId: command.conversationId,
      messageId: command.messageId,
      text: command.text,
      idempotencyKey: command.idempotencyKey,
      locale: command.locale,
      ...(command.contextRevision === undefined
        ? {}
        : { contextRevision: command.contextRevision }),
      ...(command.expectedContextRevision === undefined
        ? {}
        : { expectedContextRevision: command.expectedContextRevision }),
    });
    if (!result.accepted) return this.rejectResult(result.code, reply);
    const response = {
      schemaVersion: 4 as const,
      accepted: true,
      narrative: result.value.narrative,
      toolResults: result.value.toolResults,
    };
    const parsedResponse = parseV4Contract<DdaAgentTurnAccepted>(
      AGENT_TURN_ACCEPTED_SCHEMA_ID,
      response,
    );
    if (!parsedResponse.accepted) throw new ServiceUnavailableException();
    return parsedResponse.value;
  }

  @Post('tools/deterministic')
  public async executeDeterministic(
    @Req() request: unknown,
    @Body() body: AgentDeterministicToolRequestDtoV1,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    this.rejectClientAuthority(body, request);
    const context = await this.resolveContext(request);
    const result = await this.service.executeDeterministicTool({
      context,
      conversationId: body.conversationId,
      toolName: body.toolName,
      input: body.input,
      idempotencyKey: body.idempotencyKey,
    });
    if (!result.accepted) return this.rejectResult(result.code, reply);
    return { accepted: true, value: result.value };
  }

  private rejectClientAuthority(body: unknown, request: unknown): void {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasClientAuthorityField(body) ||
      hasClientAuthorityField(requestRecord?.['body']) ||
      hasClientAuthorityField(requestRecord?.['query']) ||
      hasClientAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
  }

  private rejectResult(code: AgentTurnProblemCodeV1, reply?: FastifyReply) {
    if (reply === undefined) throw new AgentTurnProblemError(code);
    reply.code(agentTurnProblemStatus(code));
    return SAFE_AGENT_TURN_ERROR;
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
  }
}
