import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { RULE_SET_REPOSITORY_PORT, type RuleSetRepositoryPortV1 } from '../application/rule-set-repository.port.js';
import { RuleSetService } from '../application/rule-set.service.js';
import { CreateRuleSetDto } from './mapping.dto.js';
import { REQUEST_TENANT_CONTEXT, type RequestTenantContextPortV1 } from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/datasets/:datasetId/rules')
export class RuleSetController {
  private readonly ruleSets: RuleSetService;

  public constructor(
    @Inject(RULE_SET_REPOSITORY_PORT) repository: RuleSetRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.ruleSets = new RuleSetService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable quality rule-set draft' })
  @ApiBody({ type: CreateRuleSetDto })
  async create(@Req() request: unknown, @Param('datasetId') datasetIdInput: string, @Body() input: CreateRuleSetDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    if (!datasetId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.ruleSets.create(context, { ...input, datasetId: datasetId.value, tenantScope: context.tenantScope });
  }

  @Get()
  @ApiOperation({ summary: 'List immutable quality rule-set versions' })
  async list(@Req() request: unknown, @Param('datasetId') datasetIdInput: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const datasetId = parseStableIdentifierV1(datasetIdInput);
    if (!datasetId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return this.ruleSets.list(context, datasetId.value);
  }
}
