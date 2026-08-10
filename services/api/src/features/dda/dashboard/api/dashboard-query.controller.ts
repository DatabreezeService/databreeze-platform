import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { DashboardQueryServiceV1 } from '../application/dashboard-query.service.js';
import type { DashboardAuthActionV1 } from '../application/dashboard-authorization.port.js';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export interface DashboardViewDtoV1 {
  readonly context: IamTenantContextV1;
  readonly snapshotId: string;
  readonly rows: readonly Record<string, string>[];
}

export interface DashboardAuthorizeDtoV1 {
  readonly context: IamTenantContextV1;
  readonly snapshotId: string;
  readonly action: DashboardAuthActionV1;
}

@ApiTags('dda-dashboard-query')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/dashboards/query')
export class DashboardQueryControllerV1 {
  public constructor(private readonly queries: DashboardQueryServiceV1) {}

  @Post('view')
  public async view(@Body() body: DashboardViewDtoV1) {
    return this.queries.view(body.context, body);
  }

  @Post('authorize')
  public async authorize(@Body() body: DashboardAuthorizeDtoV1) {
    return this.queries.authorizeAction(body.context, body);
  }
}
