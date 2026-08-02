import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  PROTECTED_DOCUMENT_SECRET_INPUT_PORT,
  type ProtectedDocumentSecretInputPortV1,
} from '../application/protected-document-secret-input.port.js';
import {
  PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT,
  type ProtectedDocumentUnlockRepositoryPortV1,
} from '../application/protected-document-unlock-repository.port.js';
import { ProtectedDocumentUnlockService } from '../application/protected-document-unlock.service.js';
import {
  CreateProtectedDocumentUnlockDto,
  ExpireProtectedDocumentUnlockDto,
  RecordProtectedDocumentUnlockOutcomeDto,
} from './protected-document-unlock.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-015: unlock control plane exposes state/handles only; secret values stay local. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/protected-document-unlocks')
export class ProtectedDocumentUnlockController {
  private readonly unlocks: ProtectedDocumentUnlockService;

  public constructor(
    @Inject(PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT)
    requests: ProtectedDocumentUnlockRepositoryPortV1,
    @Inject(PROTECTED_DOCUMENT_SECRET_INPUT_PORT) secretInput: ProtectedDocumentSecretInputPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.unlocks = new ProtectedDocumentUnlockService(requests, secretInput);
  }

  @Post()
  @ApiOperation({ summary: 'Create a secret-free protected-document unlock request' })
  @ApiBody({ type: CreateProtectedDocumentUnlockDto })
  async create(
    @Req() request: unknown,
    @Body() input: CreateProtectedDocumentUnlockDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.unlocks.create(context, input);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Read protected-document unlock state without credentials' })
  async find(@Req() request: unknown, @Param('requestId') requestId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.unlocks.find(context, requestId);
  }

  @Post(':requestId/handle')
  @ApiOperation({ summary: 'Issue a one-shot local secret-input handle' })
  async issueHandle(
    @Req() request: unknown,
    @Param('requestId') requestId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.unlocks.issueHandle(context, requestId);
  }

  @Post(':requestId/outcome')
  @ApiOperation({ summary: 'Record a local unlock outcome using an opaque handle' })
  @ApiBody({ type: RecordProtectedDocumentUnlockOutcomeDto })
  async recordOutcome(
    @Req() request: unknown,
    @Param('requestId') requestId: string,
    @Body() input: RecordProtectedDocumentUnlockOutcomeDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.unlocks.recordOutcome(context, requestId, input);
  }

  @Post(':requestId/expire')
  @ApiOperation({ summary: 'Expire an open unlock request and release local handles' })
  @ApiBody({ type: ExpireProtectedDocumentUnlockDto })
  async expire(
    @Req() request: unknown,
    @Param('requestId') requestId: string,
    @Body() input: ExpireProtectedDocumentUnlockDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.unlocks.expire(context, requestId, input.now);
  }
}
