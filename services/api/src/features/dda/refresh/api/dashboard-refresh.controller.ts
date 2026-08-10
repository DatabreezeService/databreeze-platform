import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { FreshnessService, type FreshnessResultV1 } from '../application/freshness.service.js';

export interface FreshnessRequestContextV1 {
  readonly tenantScope: TenantScopeV1;
  readonly authorizedPermissionProjectionVersionId: string;
  readonly nowMs: number;
}

/**
 * DDA-033 freshness REST surface.
 * Root composition is owned by plan 087; this controller is exported for integration.
 */
@ApiTags('dda-dashboard-refresh')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardRefreshController {
  public constructor(private readonly freshness: FreshnessService) {}

  @Get(':dashboardId/freshness')
  @ApiOperation({ summary: 'Read authorized dashboard freshness and last-good snapshot refs' })
  public async getFreshness(
    context: FreshnessRequestContextV1,
    @Param('dashboardId') dashboardId: string,
  ): Promise<FreshnessResultV1> {
    return this.freshness.getFreshness({
      tenantScope: context.tenantScope,
      dashboardId,
      authorizedPermissionProjectionVersionId: context.authorizedPermissionProjectionVersionId,
      nowMs: context.nowMs,
    });
  }
}
