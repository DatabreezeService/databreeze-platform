import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPortV1,
} from '../application/audit-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { AuditProblemError } from '../application/audit-problem.error.js';
import {
  AUDIT_PAGE_LIMIT_MAX_V1,
  parseAuditPageCursorV1,
} from '../application/audit-page-cursor.js';
import { InputValidationException } from '../../../platform/http/input-validation.exception.js';

function pageLimit(input: string | undefined): number {
  const value = input === undefined ? 50 : Number(input);
  if (!Number.isSafeInteger(value) || value < 1 || value > AUDIT_PAGE_LIMIT_MAX_V1) {
    throw new InputValidationException([{ field: 'limit', code: 'INVALID_PAGE_LIMIT' }]);
  }
  return value;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit')
export class AuditController {
  public constructor(
    @Inject(AUDIT_REPOSITORY_PORT) private readonly repository: AuditRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('events')
  @ApiOperation({ summary: 'List immutable audit events visible to the caller' })
  @ApiOkResponse()
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiServiceUnavailableResponse({ description: 'Audit persistence is unavailable.' })
  async events(
    @Req() request: unknown,
    @Query('limit') limitInput?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const limit = pageLimit(limitInput);
    if (
      cursor !== undefined &&
      !parseAuditPageCursorV1(cursor, 'events', context.tenantScope).accepted
    )
      throw new InputValidationException([{ field: 'cursor', code: 'INVALID_CURSOR' }]);
    try {
      return await this.repository.listEventPage(context, {
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'AUD_CHAIN_INVALID') {
        throw new AuditProblemError('AUDIT_INTEGRITY_INVALID');
      }
      throw new AuditProblemError('AUDIT_UNAVAILABLE');
    }
  }

  @Get('seals')
  @ApiOperation({ summary: 'List verified audit seals visible to the caller' })
  @ApiOkResponse()
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiServiceUnavailableResponse({ description: 'Audit persistence is unavailable.' })
  async seals(
    @Req() request: unknown,
    @Query('limit') limitInput?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const limit = pageLimit(limitInput);
    if (
      cursor !== undefined &&
      !parseAuditPageCursorV1(cursor, 'seals', context.tenantScope).accepted
    )
      throw new InputValidationException([{ field: 'cursor', code: 'INVALID_CURSOR' }]);
    try {
      return await this.repository.listSealPage(context, {
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'AUD_CHAIN_INVALID') {
        throw new AuditProblemError('AUDIT_INTEGRITY_INVALID');
      }
      throw new AuditProblemError('AUDIT_UNAVAILABLE');
    }
  }
}
