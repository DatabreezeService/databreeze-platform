import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { AgentTurnService } from '../application/agent-turn.service.js';

export class AgentTurnProblemError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = 'AgentTurnProblemError';
  }
}

export interface AgentTurnHttpRequestV1 {
  readonly tenantScope: TenantScopeV1;
  readonly memberAuthorized: boolean;
  readonly conversationId: string;
  readonly messageId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly locale: string;
  readonly agentLevel: AgentGrantLevelV1;
  readonly contextRevision?: number;
  readonly expectedContextRevision?: number;
}

export interface AgentDeterministicToolHttpRequestV1 {
  readonly tenantScope: TenantScopeV1;
  readonly memberAuthorized: boolean;
  readonly conversationId: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly agentLevel: AgentGrantLevelV1;
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/agent')
export class AgentTurnController {
  public constructor(private readonly service: AgentTurnService) {}

  @Post('turns')
  public async runTurn(@Body() dto: AgentTurnHttpRequestV1) {
    const result = await this.service.runTurn(dto);
    if (!result.accepted) throw new AgentTurnProblemError(result.code);
    return {
      accepted: true,
      narrative: result.value.narrative,
      toolResults: result.value.toolResults,
    };
  }

  @Post('tools/deterministic')
  public async executeDeterministic(@Body() dto: AgentDeterministicToolHttpRequestV1) {
    const result = await this.service.executeDeterministicTool(dto);
    if (!result.accepted) throw new AgentTurnProblemError(result.code);
    return { accepted: true, value: result.value };
  }
}
