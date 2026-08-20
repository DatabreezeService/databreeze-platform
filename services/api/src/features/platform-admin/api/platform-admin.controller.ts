import { Controller, Get, HttpException, HttpStatus, Inject, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  PLATFORM_ADMIN_SERVICE,
  type PlatformAdminService,
} from '../application/platform-admin.service.js';
import {
  REQUEST_AUTHENTICATED_ACTOR,
  type RequestAuthenticatedActorPortV1,
} from '../../../platform/http/request-authenticated-actor.port.js';

const ALLOWED_WINDOWS = new Set([30, 90, 180, 365]);

function windowDays(input: string | undefined): number {
  if (input === undefined) return 180;
  const parsed = Number(input);
  if (!Number.isSafeInteger(parsed) || !ALLOWED_WINDOWS.has(parsed))
    throw new HttpException({ code: 'PLATFORM_ADMIN_WINDOW_INVALID' }, HttpStatus.BAD_REQUEST);
  return parsed;
}

@ApiTags('platform-admin')
@Controller('v1/platform-admin')
export class PlatformAdminController {
  public constructor(
    @Inject(PLATFORM_ADMIN_SERVICE) private readonly service: PlatformAdminService,
    @Inject(REQUEST_AUTHENTICATED_ACTOR)
    private readonly requestActor: RequestAuthenticatedActorPortV1,
  ) {}

  @Get('overview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the authorized internal DataBreeze product overview' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'generatedAt',
        'operator',
        'window',
        'totals',
        'subscriptionStatuses',
        'subscriptionPlans',
        'registrationSeries',
        'revenueSeries',
        'recentUsers',
        'recentSubscriptions',
        'recentPayments',
      ],
      properties: {
        schemaVersion: { type: 'integer', enum: [4] },
        generatedAt: { type: 'string', format: 'date-time' },
        operator: { type: 'object' },
        window: { type: 'object' },
        totals: { type: 'object' },
        subscriptionStatuses: { type: 'array', items: { type: 'object' } },
        subscriptionPlans: { type: 'array', items: { type: 'object' } },
        registrationSeries: { type: 'array', items: { type: 'object' } },
        revenueSeries: { type: 'array', items: { type: 'object' } },
        recentUsers: { type: 'array', items: { type: 'object' } },
        recentSubscriptions: { type: 'array', items: { type: 'object' } },
        recentPayments: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'A valid authenticated session is required.' })
  @ApiForbiddenResponse({ description: 'The caller is not an active platform operator.' })
  @ApiServiceUnavailableResponse({
    description: 'Authoritative platform analytics are unavailable.',
  })
  public async overview(@Req() request: unknown, @Query('days') daysInput?: string) {
    const actor = await this.requestActor.resolve(request);
    return this.service.overview(actor.actorId, windowDays(daysInput));
  }

  @Get('feedbacks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the bounded latest landing feedback submissions' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'generatedAt', 'total', 'feedbacks'],
      properties: {
        schemaVersion: { type: 'integer', enum: [4] },
        generatedAt: { type: 'string', format: 'date-time' },
        total: { type: 'integer', minimum: 0 },
        feedbacks: { type: 'array', maxItems: 200, items: { type: 'object' } },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'A valid authenticated session is required.' })
  @ApiForbiddenResponse({ description: 'The caller is not an active platform operator.' })
  @ApiServiceUnavailableResponse({
    description: 'Authoritative landing feedback reads are unavailable.',
  })
  public async feedbacks(@Req() request: unknown) {
    const actor = await this.requestActor.resolve(request);
    return this.service.feedbacks(actor.actorId, 200);
  }
}
