import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ARTIFACT_INTAKE_REPOSITORY_PORT,
  type ArtifactIntakeRepositoryPortV1,
} from '../application/artifact-intake-repository.port.js';
import {
  ArtifactIntakeService,
  type ArtifactIntakeServiceResultV1,
} from '../application/artifact-intake.service.js';
import { CreateInboxItemDto, UpdateInboxMetadataDto } from './inbox-item.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

type PublicInboxItemResponseV1 = Readonly<{
  schemaVersion: 1;
  inboxItemId: string;
  artifactVersionId: string;
  state: string;
  createdAt: string;
  revision: number;
}>;

function toPublicInboxItem(item: {
  readonly inboxItemId: string;
  readonly artifactVersionId: string;
  readonly state: string;
  readonly createdAt: string;
  readonly revision: number;
}): PublicInboxItemResponseV1 {
  return Object.freeze({
    schemaVersion: 1 as const,
    inboxItemId: item.inboxItemId,
    artifactVersionId: item.artifactVersionId,
    state: item.state,
    createdAt: item.createdAt,
    revision: item.revision,
  });
}

function parseRevisionHeader(value: string | undefined): number | 'INVALID' | undefined {
  if (value === undefined) return undefined;
  const match = /^(?:W\/)?"?([1-9][0-9]*)"?$/u.exec(value.trim());
  if (!match) return 'INVALID';
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : 'INVALID';
}

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifacts')
export class InboxController {
  private readonly intake: ArtifactIntakeService;

  public constructor(
    @Inject(ARTIFACT_INTAKE_REPOSITORY_PORT)
    repository: ArtifactIntakeRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.intake = new ArtifactIntakeService(repository);
  }

  @Post('inbox')
  @ApiOperation({ summary: 'Register a content-free artifact intake item' })
  @ApiBody({ type: CreateInboxItemDto })
  async create(
    @Req() request: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateInboxItemDto,
  ): Promise<ArtifactIntakeServiceResultV1<unknown>> {
    const context = await this.requestContext.resolve(request);
    return this.intake.create(context, {
      inboxItemId: input.inboxItemId,
      tenantScope: context.tenantScope,
      idempotencyKey: idempotencyKey ?? input.idempotencyKey ?? context.idempotencyKey,
      artifactVersionId: input.artifactVersionId,
      createdAt: input.createdAt,
    });
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List content-free artifact intake items visible to the caller' })
  async list(@Req() request: unknown): Promise<readonly PublicInboxItemResponseV1[]> {
    const context = await this.requestContext.resolve(request);
    const items = await this.intake.list(context);
    return Object.freeze(items.map(toPublicInboxItem));
  }

  @Patch('inbox/:inboxItemId')
  @ApiOperation({ summary: 'Update revisioned, content-free inbox triage metadata' })
  @ApiHeader({
    name: 'If-Match',
    required: false,
    description: 'Expected inbox revision, for example 3 or "3".',
  })
  @ApiBody({ type: UpdateInboxMetadataDto })
  async updateMetadata(
    @Req() request: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateInboxMetadataDto,
    @Param('inboxItemId') inboxItemId: string,
  ): Promise<ArtifactIntakeServiceResultV1<unknown>> {
    const context = await this.requestContext.resolve(request);
    const headerRevision = parseRevisionHeader(ifMatch);
    if (headerRevision === 'INVALID')
      return Object.freeze({ accepted: false, code: 'INVALID_METADATA' as const });
    const expectedRevision = input.expectedRevision ?? headerRevision ?? context.expectedRevision;
    const parsedId = parseStableIdentifierV1(inboxItemId);
    if (!parsedId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    if (expectedRevision === undefined)
      return Object.freeze({ accepted: false, code: 'INVALID_METADATA' as const });
    const mutationContext = Object.freeze({ ...context, expectedRevision });
    return this.intake.updateMetadata(mutationContext, parsedId.value, {
      ...(Object.hasOwn(input, 'assigneeId') ? { assigneeId: input.assigneeId } : {}),
      ...(Object.hasOwn(input, 'labels') ? { labels: input.labels } : {}),
      ...(Object.hasOwn(input, 'priority') ? { priority: input.priority } : {}),
      ...(Object.hasOwn(input, 'dueAt') ? { dueAt: input.dueAt } : {}),
    });
  }
}
