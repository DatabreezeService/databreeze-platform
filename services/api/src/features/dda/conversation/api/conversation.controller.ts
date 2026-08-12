import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { ConversationService } from '../application/conversation.service.js';

export class ConversationProblemError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = 'ConversationProblemError';
  }
}

export interface ConversationCreateDtoV1 {
  readonly tenantScope: TenantScopeV1;
  readonly memberAuthorized: boolean;
  readonly title: string;
  readonly datasetIds: readonly string[];
  readonly datasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  readonly idempotencyKey: string;
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/conversations')
export class ConversationController {
  public constructor(private readonly service: ConversationService) {}

  @Post()
  public async create(@Body() dto: ConversationCreateDtoV1) {
    const result = await this.service.createConversation(
      { tenantScope: dto.tenantScope, memberAuthorized: dto.memberAuthorized },
      {
        title: dto.title,
        datasetIds: dto.datasetIds,
        datasetVersionIds: dto.datasetVersionIds,
        ...(dto.dashboardId === undefined ? {} : { dashboardId: dto.dashboardId }),
        ...(dto.filterContext === undefined ? {} : { filterContext: dto.filterContext }),
      },
      dto.idempotencyKey,
    );
    if (!result.accepted) throw new ConversationProblemError(result.code);
    return {
      accepted: true,
      conversationId: result.value.conversationId,
      title: result.value.title,
      activeDatasetIds: result.value.activeDatasetIds,
    };
  }

  @Get()
  public async list(
    @Query('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('memberAuthorized') memberAuthorized: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ) {
    const result = await this.service.listConversations(
      {
        tenantScope: { organizationId, workspaceId } as TenantScopeV1,
        memberAuthorized: memberAuthorized === 'true',
      },
      cursor,
      Number(limit),
    );
    if (!result.accepted) throw new ConversationProblemError(result.code);
    return { accepted: true, items: result.value };
  }

  @Get(':conversationId')
  public async load(
    @Param('conversationId') conversationId: string,
    @Query('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('memberAuthorized') memberAuthorized: string,
    @Query('beforeCursor') beforeCursor?: string,
    @Query('limit') limit = '50',
  ) {
    const result = await this.service.loadConversation(
      {
        tenantScope: { organizationId, workspaceId } as TenantScopeV1,
        memberAuthorized: memberAuthorized === 'true',
      },
      conversationId,
      beforeCursor,
      Number(limit),
    );
    if (!result.accepted) throw new ConversationProblemError(result.code);
    return {
      accepted: true,
      conversation: result.value.conversation,
      messages: result.value.messages,
    };
  }
}
