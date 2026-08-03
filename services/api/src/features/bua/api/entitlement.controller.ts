import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type { EntitlementSnapshotV1, UsageLedgerStateV1 } from '@databreeze/domain/entitlements/v1';

import {
  ENTITLEMENT_REPOSITORY_PORT,
  type EntitlementRepositoryPortV1,
} from '../application/entitlement-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

type EntitlementNotFoundV1 = { readonly accepted: false; readonly code: 'ENTITLEMENT_NOT_FOUND' };

@ApiTags('entitlements')
@ApiBearerAuth()
@Controller('v1/entitlements')
export class EntitlementController {
  public constructor(
    @Inject(ENTITLEMENT_REPOSITORY_PORT)
    private readonly repository: EntitlementRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('snapshots/:snapshotId')
  @ApiOperation({ summary: 'Read one immutable entitlement snapshot in the caller scope' })
  async snapshot(
    @Req() request: unknown,
    @Param('snapshotId') snapshotIdInput: string,
  ): Promise<
    | EntitlementSnapshotV1
    | EntitlementNotFoundV1
    | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' }
  > {
    const context = await this.requestContext.resolve(request);
    const parsed = parseStableIdentifierV1(snapshotIdInput);
    if (!parsed.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    return (
      (await this.repository.findSnapshot(context, parsed.value)) ?? {
        accepted: false,
        code: 'ENTITLEMENT_NOT_FOUND',
      }
    );
  }

  @Get('usage')
  @ApiOperation({ summary: 'Read the append-only usage ledger state in the caller scope' })
  async usage(@Req() request: unknown): Promise<UsageLedgerStateV1> {
    const context = await this.requestContext.resolve(request);
    return this.repository.listUsageState(context);
  }
}
