import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { DashboardPublicationServiceV1 } from '../application/dashboard-publication.service.js';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export interface PublishDashboardDtoV1 {
  readonly context: IamTenantContextV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS' | 'SHARED_LINK';
  readonly materializationIds: readonly string[];
  readonly permissionProjectionVersionId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly approvalId?: string;
  readonly materialChange?: boolean;
}

@ApiTags('dda-dashboard-publication')
@Controller('v1/dda/dashboards/publication')
export class DashboardPublicationControllerV1 {
  public constructor(private readonly publications: DashboardPublicationServiceV1) {}

  @Post('publish')
  public async publish(@Body() body: PublishDashboardDtoV1) {
    return this.publications.publish(body.context, body);
  }
}
