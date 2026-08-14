import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import { DashboardPublicationServiceV1 } from '../application/dashboard-publication.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

export interface PublishDashboardDtoV1 {
  readonly dashboardId: string;
  readonly versionId: string;
  readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  readonly materializationIds: readonly string[];
  readonly permissionProjectionVersionId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly approvalId?: string;
  readonly materialChange?: boolean;
}

@ApiTags('dda-dashboard-publication')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/dashboards/publication')
export class DashboardPublicationControllerV1 {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly publications: DashboardPublicationServiceV1,
    @Optional() @Inject(REQUEST_TENANT_CONTEXT) requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post('publish')
  public async publish(@Req() request: unknown, @Body() body: PublishDashboardDtoV1) {
    if (
      'context' in (body as unknown as Record<string, unknown>) ||
      body.audience === ('SHARED_LINK' as never)
    ) {
      throw new BadRequestException();
    }
    let context: IamTenantContextV1;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) throw new UnauthorizedException();
      throw new ServiceUnavailableException();
    }
    let result;
    try {
      result = await this.publications.publish(context, body);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) {
      if (result.code === 'UNAUTHORIZED') throw new ForbiddenException();
      if (result.code === 'VERSION_NOT_FOUND') throw new NotFoundException();
      if (result.code === 'REVISION_CONFLICT' || result.code === 'APPROVAL_INVALIDATED') {
        throw new ConflictException();
      }
      throw new UnprocessableEntityException();
    }
    return Object.freeze({
      accepted: true as const,
      revision: body.expectedRevision + 1,
      snapshotId: result.value.snapshotId,
      dashboardVersionId: result.value.dashboardVersionId,
      canonicalHash: result.value.canonicalHash,
    });
  }
}
