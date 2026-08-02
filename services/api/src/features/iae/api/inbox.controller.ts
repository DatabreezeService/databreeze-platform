import { Body, Controller, Get, Headers, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ARTIFACT_INTAKE_REPOSITORY_PORT,
  type ArtifactIntakeRepositoryPortV1,
} from '../application/artifact-intake-repository.port.js';
import {
  ArtifactIntakeService,
  type ArtifactIntakeServiceResultV1,
} from '../application/artifact-intake.service.js';
import { CreateInboxItemDto } from './inbox-item.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

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
  async list(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.intake.list(context);
  }
}
