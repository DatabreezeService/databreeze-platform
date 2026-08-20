import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { RegisterMobilePushDto, CreateMobileReportDto } from './mobile.dto.js';
import { IssueMobileRouteTokenDto } from './mobile.dto.js';
import {
  MOBILE_REPOSITORY_PORT,
  type MobileRepositoryPortV1,
} from '../application/mobile-repository.port.js';
import { sha256MobileToken } from '../application/mobile-token.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

function bad(error: string, status = HttpStatus.BAD_REQUEST): never {
  throw new HttpException({ error }, status);
}

@ApiTags('mobile')
@ApiBearerAuth()
@Controller('v1/mobile')
export class MobileController {
  public constructor(
    @Inject(MOBILE_REPOSITORY_PORT) private readonly mobile: MobileRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('tasks')
  @ApiOperation({ summary: 'List content-safe, tenant-scoped mobile task cards' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: [
              'resourceType',
              'resourceId',
              'revision',
              'taskType',
              'safeTitleKey',
              'evidenceAvailability',
              'permittedActions',
            ],
            properties: {
              resourceType: { type: 'string', maxLength: 64 },
              resourceId: { type: 'string', maxLength: 128 },
              revision: { type: 'integer', minimum: 1 },
              taskType: { type: 'string', maxLength: 32 },
              safeTitleKey: { type: 'string', maxLength: 128 },
              evidenceAvailability: { type: 'string', enum: ['AVAILABLE', 'RESTRICTED', 'NONE'] },
              permittedActions: {
                type: 'array',
                maxItems: 16,
                items: { type: 'string', maxLength: 64 },
              },
            },
          },
        },
      },
    },
  })
  async tasks(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return { items: await this.mobile.listTasks(context) };
  }

  @Post('route-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: IssueMobileRouteTokenDto })
  @ApiOperation({ summary: 'Issue one short-lived route token for an authenticated App Link' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['accepted', 'value'],
      properties: {
        accepted: { type: 'boolean', enum: [true] },
        value: {
          type: 'object',
          required: ['token', 'route', 'expiresAt'],
          properties: {
            token: { type: 'string', minLength: 16, maxLength: 96 },
            route: { type: 'string', enum: ['tasks', 'evidence', 'billing'] },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async issueRoute(
    @Req() request: unknown,
    @Body() input: IssueMobileRouteTokenDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(Date.now() + 5 * 60_000);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now() ||
      expiresAt.getTime() > Date.now() + 15 * 60_000
    )
      bad('route_token_expiry_invalid');
    const raw = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
    const token = raw.slice(0, 96);
    await this.mobile.issueRouteToken(context, {
      id: randomUUID(),
      tokenDigest: sha256MobileToken(token),
      route: input.route,
      expiresAt,
    });
    return {
      accepted: true,
      value: { token, route: input.route, expiresAt: expiresAt.toISOString() },
    };
  }

  @Post('route-tokens/:token/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume one expiring, tenant-scoped App Link route token' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['accepted', 'value'],
      properties: {
        accepted: { type: 'boolean', enum: [true] },
        value: {
          type: 'object',
          required: ['route'],
          properties: { route: { type: 'string', enum: ['tasks', 'evidence', 'billing'] } },
        },
      },
    },
  })
  async resolveRoute(@Req() request: unknown, @Param('token') token: string): Promise<unknown> {
    if (token.length < 16 || token.length > 512 || /[^A-Za-z0-9._~-]/u.test(token))
      bad('route_token_invalid');
    const context = await this.requestContext.resolve(request);
    const route = await this.mobile.resolveRouteToken(context, sha256MobileToken(token));
    if (!route) bad('route_token_invalid_or_expired', HttpStatus.NOT_FOUND);
    return { accepted: true, value: { route } };
  }

  @Post('push-registrations')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RegisterMobilePushDto })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['accepted', 'value'],
      properties: {
        accepted: { type: 'boolean', enum: [true] },
        value: {
          type: 'object',
          required: ['registrationId'],
          properties: { registrationId: { type: 'string', format: 'uuid' } },
        },
      },
    },
  })
  async registerPush(
    @Req() request: unknown,
    @Body() input: RegisterMobilePushDto,
  ): Promise<unknown> {
    if (!/^[a-f0-9]{64}$/u.test(input.installationIdHash)) bad('installation_hash_invalid');
    const context = await this.requestContext.resolve(request);
    const id = randomUUID();
    await this.mobile.registerPush(context, {
      id,
      platform: 'ANDROID',
      providerTokenDigest: sha256MobileToken(input.providerToken),
      installationIdHash: input.installationIdHash,
      now: new Date(),
    });
    return { accepted: true, value: { registrationId: id } };
  }

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CreateMobileReportDto })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['accepted', 'value'],
      properties: {
        accepted: { type: 'boolean', enum: [true] },
        value: {
          type: 'object',
          required: ['reportId', 'status'],
          properties: {
            reportId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['RECEIVED'] },
          },
        },
      },
    },
  })
  async report(@Req() request: unknown, @Body() input: CreateMobileReportDto): Promise<unknown> {
    if (!/^[a-f0-9]{64}$/u.test(input.payloadDigest)) bad('payload_digest_invalid');
    const context = await this.requestContext.resolve(request);
    const id = randomUUID();
    await this.mobile.createReport(context, {
      id,
      reportType: input.reportType,
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      payloadDigest: input.payloadDigest,
    });
    return { accepted: true, value: { reportId: id, status: 'RECEIVED' } };
  }

  @Get('reports')
  @ApiOperation({
    summary: 'List redacted mobile reports/comments for the current workspace actor',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['reportId', 'reportType', 'status', 'createdAt'],
            properties: {
              reportId: { type: 'string', format: 'uuid' },
              reportType: { type: 'string', maxLength: 64 },
              status: { type: 'string', maxLength: 24 },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async reports(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return { items: await this.mobile.listReports(context) };
  }
}
