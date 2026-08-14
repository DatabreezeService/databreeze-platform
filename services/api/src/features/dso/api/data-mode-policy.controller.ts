import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DATA_MODE_POLICY_SERVICE,
  type DataModePolicyService,
} from '../application/data-mode-policy.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('v1/data-mode-policies')
export class DataModePolicyController {
  public constructor(
    @Inject(DATA_MODE_POLICY_SERVICE) private readonly policies: DataModePolicyService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get(':policyId')
  @ApiOperation({ summary: 'List immutable versions of one workspace data-mode policy' })
  async list(@Req() request: unknown, @Param('policyId') policyId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsed = parseStableIdentifierV1(policyId);
    if (!parsed.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' as const };
    return { accepted: true, value: await this.policies.list(context, parsed.value) };
  }
}
