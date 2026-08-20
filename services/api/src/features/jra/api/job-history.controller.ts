import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  parseV4Contract,
  type JraJobHistoryDetailAccepted,
  type JraJobHistoryListAccepted,
} from '@databreeze/contracts/v4';
import { PERMISSIONS_V1, roleHasPermissionV1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  IAM_REPOSITORY_PORT,
  type IamRepositoryPortV1,
} from '../../iam/application/iam-repository.port.js';
import {
  JOB_HISTORY_READ_PORT,
  type JobHistoryReadPortV1,
} from '../application/job-history-read.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

const LIST_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/jra-job-history-list-accepted' as const;
const DETAIL_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/jra-job-history-detail-accepted' as const;

function queryKeys(request: unknown): readonly string[] {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return [];
  const query = (request as Record<string, unknown>)['query'];
  if (query === null || typeof query !== 'object' || Array.isArray(query)) return [];
  return Object.keys(query as Record<string, unknown>);
}

function rejectUnknownQuery(request: unknown): void {
  const allowed = new Set(['limit', 'cursor']);
  if (queryKeys(request).some((key) => !allowed.has(key))) throw new BadRequestException();
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 25;
  if (!/^\d{1,3}$/u.test(value)) throw new BadRequestException({ code: 'INVALID_LIMIT' });
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100)
    throw new BadRequestException({ code: 'INVALID_LIMIT' });
  return parsed;
}

function parseJobId(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
  return parsed.value;
}

function acceptedList(value: unknown): JraJobHistoryListAccepted {
  const parsed = parseV4Contract<JraJobHistoryListAccepted>(LIST_SCHEMA_ID, value);
  if (!parsed.accepted) throw new ServiceUnavailableException();
  return parsed.value;
}

function acceptedDetail(value: unknown): JraJobHistoryDetailAccepted {
  const parsed = parseV4Contract<JraJobHistoryDetailAccepted>(DETAIL_SCHEMA_ID, value);
  if (!parsed.accepted) throw new ServiceUnavailableException();
  return parsed.value;
}

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('v1/jobs')
export class JobHistoryController {
  public constructor(
    @Inject(JOB_HISTORY_READ_PORT) private readonly history: JobHistoryReadPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
    @Optional() @Inject(IAM_REPOSITORY_PORT) private readonly iam?: IamRepositoryPortV1,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List metadata-only execution history in the current scope' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  public async list(
    @Req() request: unknown,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<JraJobHistoryListAccepted> {
    rejectUnknownQuery(request);
    const context = await this.resolveContext(request);
    await this.authorize(context);
    try {
      const page = await this.history.list(context, {
        limit: parseLimit(limit),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return acceptedList({ schemaVersion: 4, accepted: true, ...page });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Read one exact-scope metadata-only execution history entry' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  public async get(
    @Req() request: unknown,
    @Param('jobId') jobId: string,
  ): Promise<JraJobHistoryDetailAccepted> {
    const parsedJobId = parseJobId(jobId);
    const context = await this.resolveContext(request);
    await this.authorize(context);
    try {
      const job = await this.history.find(context, parsedJobId);
      if (job === undefined) throw new NotFoundException();
      return acceptedDetail({ schemaVersion: 4, accepted: true, job });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
  }

  private async authorize(
    context: Awaited<ReturnType<RequestTenantContextPortV1['resolve']>>,
  ): Promise<void> {
    if (this.iam === undefined) throw new ServiceUnavailableException();
    let membership;
    try {
      membership = await this.iam.findMembership(context, context.actorId);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (
      membership?.status !== 'ACTIVE' ||
      !tenantScopeContainsV1(membership.scope, context.tenantScope) ||
      !roleHasPermissionV1(membership.roleId, PERMISSIONS_V1.JOB_EXECUTION_READ)
    ) {
      throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    }
  }
}
