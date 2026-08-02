import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { REFERENCE_ENTITY_REPOSITORY_PORT, type ReferenceEntityRepositoryPortV1 } from '../application/reference-entity-repository.port.js';
import { ReferenceEntityService } from '../application/reference-entity.service.js';
import { CreateReferenceEntityDto, MergeReferenceEntityDto } from './reference-entity.dto.js';
import { REQUEST_TENANT_CONTEXT, type RequestTenantContextPortV1 } from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('reference-entities')
@ApiBearerAuth()
@Controller('v1/reference-entities')
export class ReferenceEntityController {
  private readonly entities: ReferenceEntityService;

  public constructor(
    @Inject(REFERENCE_ENTITY_REPOSITORY_PORT) repository: ReferenceEntityRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.entities = new ReferenceEntityService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable business-party version' })
  @ApiBody({ type: CreateReferenceEntityDto })
  async create(@Req() request: unknown, @Body() input: CreateReferenceEntityDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.entities.create(context, { ...input, tenantScope: context.tenantScope });
  }

  @Post('merge')
  @ApiOperation({ summary: 'Record an explicit business-party merge resolution' })
  @ApiBody({ type: MergeReferenceEntityDto })
  async merge(@Req() request: unknown, @Body() input: MergeReferenceEntityDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.entities.merge(context, { ...input, actorId: context.actorId });
  }

  @Get(':entityId/versions')
  @ApiOperation({ summary: 'List immutable business-party versions' })
  async list(@Req() request: unknown, @Param('entityId') entityIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const entityId = parseStableIdentifierV1(entityIdInput);
    if (!entityId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.entities.listVersions(context, entityId.value);
  }
}
