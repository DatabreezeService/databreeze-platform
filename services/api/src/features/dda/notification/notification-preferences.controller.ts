import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  parseV4Contract,
  type DdaNotificationPreferencesAccepted,
  type DdaNotificationPreferencesCommand,
} from '@databreeze/contracts/v4';
import type { FastifyReply } from 'fastify';
import {
  DDA_NOTIFICATION_PREFERENCES_PORT,
  fingerprintNotificationPreferencesV1,
  type NotificationPreferencesPortV1,
} from './notification-preferences.port.js';
import type { NotificationTenantContextV1 } from './notification-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { UnavailableNotificationPreferencesAdapter } from './unavailable-notification-preferences.adapter.js';

const COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-command' as const;
const ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-accepted' as const;
const AUTHORITY_FIELDS = new Set([
  'tenantScope',
  'workspaceId',
  'organizationId',
  'projectId',
  'actorId',
  'recipientId',
  'memberId',
  'role',
  'authorized',
  'authorization',
]);

function hasAuthority(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasAuthority(child, seen),
  );
}

function rejectAuthority(request: unknown, input?: unknown): void {
  if (
    hasAuthority(input) ||
    (typeof request === 'object' &&
      request !== null &&
      ['body', 'query', 'params'].some((key) =>
        hasAuthority((request as Record<string, unknown>)[key]),
      ))
  ) {
    throw new BadRequestException('HTTP_400');
  }
}

function mapContextError(error: unknown): never {
  if (error instanceof RequestTenantContextProblemError) {
    if (error.code === 'CONTEXT_INVALID') throw new BadRequestException('HTTP_400');
    if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException('HTTP_401');
  }
  throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
}

function statusFor(code: string): number {
  switch (code) {
    case 'INVALID_INPUT':
      return HttpStatus.BAD_REQUEST;
    case 'UNAUTHORIZED':
      return HttpStatus.FORBIDDEN;
    case 'REVISION_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function writeFailure(
  result: { readonly accepted: false; readonly code: string },
  reply?: FastifyReply,
): never {
  const status = statusFor(result.code);
  reply?.code(status);
  if (result.code === 'UNAUTHORIZED') throw new ForbiddenException('HTTP_403');
  if (result.code === 'INVALID_INPUT') throw new BadRequestException('HTTP_400');
  throw new HttpException(`HTTP_${status}`, status);
}

/** NCO-006/NCO-018/NCO-024: recipient-scoped preference settings. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('v4/notification-preferences')
export class NotificationPreferencesControllerV1 {
  private readonly preferences: NotificationPreferencesPortV1;
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    @Optional()
    @Inject(DDA_NOTIFICATION_PREFERENCES_PORT)
    preferences?: NotificationPreferencesPortV1,
    @Optional() @Inject(REQUEST_TENANT_CONTEXT) requestContext?: RequestTenantContextPortV1,
  ) {
    this.preferences = preferences ?? new UnavailableNotificationPreferencesAdapter();
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Get()
  @ApiOperation({ summary: 'Get notification preferences for the authenticated workspace member' })
  @ApiOkResponse({ schema: { $ref: '#/components/schemas/DdaNotificationPreferencesAccepted' } })
  @ApiForbiddenResponse({ description: 'The authenticated actor lacks workspace scope.' })
  @ApiServiceUnavailableResponse({
    description: 'Notification preference persistence is unavailable.',
  })
  async get(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<DdaNotificationPreferencesAccepted> {
    rejectAuthority(request);
    const context = await this.resolveContext(request);
    const result = await this.preferences.get(context);
    if (!result.accepted) return writeFailure(result, reply);
    const parsed = parseV4Contract<DdaNotificationPreferencesAccepted>(
      ACCEPTED_SCHEMA,
      result.value,
    );
    if (!parsed.accepted) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    return parsed.value;
  }

  @Put()
  @ApiOperation({
    summary: 'Replace notification preferences for the authenticated workspace member',
  })
  @ApiBody({ schema: { $ref: '#/components/schemas/DdaNotificationPreferencesCommand' } })
  @ApiOkResponse({ schema: { $ref: '#/components/schemas/DdaNotificationPreferencesAccepted' } })
  @ApiBadRequestResponse({ description: 'The preference command or idempotency key is invalid.' })
  @ApiConflictResponse({ description: 'The preference revision or idempotency key conflicts.' })
  @ApiForbiddenResponse({ description: 'The authenticated actor lacks workspace scope.' })
  @ApiServiceUnavailableResponse({
    description: 'Notification preference persistence is unavailable.',
  })
  async replace(
    @Req() request: unknown,
    @Body() input: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<DdaNotificationPreferencesAccepted> {
    rejectAuthority(request, input);
    const context = await this.resolveContext(request);
    if (
      typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(idempotencyKey)
    ) {
      throw new BadRequestException('HTTP_400');
    }
    const parsed = parseV4Contract<DdaNotificationPreferencesCommand>(COMMAND_SCHEMA, input);
    if (!parsed.accepted) throw new BadRequestException('HTTP_400');
    const result = await this.preferences.replace({
      context,
      command: parsed.value,
      idempotencyKey,
      fingerprint: fingerprintNotificationPreferencesV1(parsed.value),
    });
    if (!result.accepted) return writeFailure(result, reply);
    const accepted = parseV4Contract<DdaNotificationPreferencesAccepted>(
      ACCEPTED_SCHEMA,
      result.value,
    );
    if (!accepted.accepted) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    return accepted.value;
  }

  private async resolveContext(request: unknown): Promise<NotificationTenantContextV1> {
    try {
      const context = await this.requestContext.resolve(request);
      if (
        context.tenantScope.scopeType !== 'workspace' ||
        context.tenantScope.workspaceId === undefined
      ) {
        throw new ForbiddenException('HTTP_403');
      }
      return context;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      return mapContextError(error);
    }
  }
}
