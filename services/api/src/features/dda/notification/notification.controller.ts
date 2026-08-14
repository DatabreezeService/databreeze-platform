import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Patch,
  Query,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { FastifyReply } from 'fastify';
import {
  parseV3Contract,
  type DdaNotification,
  type DdaNotificationPage,
  type DdaNotificationStateCommand,
} from '@databreeze/contracts/v3';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DDA_NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPortV1,
  type NotificationStateV1,
} from './notification-repository.port.js';
import {
  DDA_NOTIFICATION_STATE_COMMAND_PORT,
  fingerprintNotificationStateCommandV1,
  type NotificationStateCommandPortV1,
} from './notification-state-command.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { UnavailableNotificationRepositoryAdapter } from './unavailable-notification-repository.adapter.js';

const DEFAULT_LIMIT = 20;
const CURSOR_PATTERN = /^cursor-v1-[A-Za-z0-9_-]{1,480}$/u;
const STATE_COMMAND_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-notification-state-command' as const;

export class NotificationListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class NotificationStateCommandDto {
  @ApiProperty({ enum: [3] })
  @IsIn([3])
  schemaVersion!: 3;

  @ApiProperty({ enum: ['READ', 'ARCHIVED', 'DISMISSED'] })
  @IsIn(['READ', 'ARCHIVED', 'DISMISSED'])
  state!: 'READ' | 'ARCHIVED' | 'DISMISSED';

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, type: Number })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @ApiProperty({ maxLength: 200, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' })
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u)
  idempotencyKey!: string;
}

function http(status: number): never {
  throw new HttpException(`HTTP_${status}`, status);
}

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

function hasClientAuthority(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthority(child, seen),
  );
}

function rejectClientAuthority(request: unknown, ...clientInputs: readonly unknown[]): void {
  const requestRecord =
    typeof request === 'object' && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : undefined;
  if (
    hasClientAuthority(requestRecord?.['body']) ||
    hasClientAuthority(requestRecord?.['query']) ||
    hasClientAuthority(requestRecord?.['params']) ||
    clientInputs.some((value) => hasClientAuthority(value)) ||
    (requestRecord !== undefined &&
      [...AUTHORITY_FIELDS].some((field) => Object.hasOwn(requestRecord, field)))
  ) {
    http(HttpStatus.BAD_REQUEST);
  }
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 50)
    return value;
  if (typeof value === 'string' && /^[1-9][0-9]{0,1}$/u.test(value)) {
    const parsed = Number(value);
    if (parsed >= 1 && parsed <= 50) return parsed;
  }
  http(HttpStatus.BAD_REQUEST);
}

function parseCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 12 ||
    value.length > 512 ||
    !CURSOR_PATTERN.test(value)
  )
    http(HttpStatus.BAD_REQUEST);
  return value;
}

function mapContextError(error: unknown): never {
  if (error instanceof RequestTenantContextProblemError) {
    if (error.code === 'CONTEXT_INVALID') http(HttpStatus.BAD_REQUEST);
    if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException('HTTP_401');
    throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
  }
  throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
}

function setReplyStatus(reply: FastifyReply | undefined, status: number): void {
  reply?.code(status);
}

function resultStatus(code: string): number {
  switch (code) {
    case 'INVALID_CURSOR':
      return HttpStatus.BAD_REQUEST;
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'CONFLICT':
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

/** NCO-001/NCO-004/NCO-012: tenant-filtered in-app reconciliation over a durable repository port. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('v3/notifications')
export class DdaNotificationControllerV1 {
  private readonly repository: NotificationRepositoryPortV1;
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly stateCommands: NotificationStateCommandPortV1 | undefined;

  public constructor(
    @Optional()
    @Inject(DDA_NOTIFICATION_REPOSITORY_PORT)
    repository?: NotificationRepositoryPortV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(DDA_NOTIFICATION_STATE_COMMAND_PORT)
    stateCommands?: NotificationStateCommandPortV1,
  ) {
    this.repository = repository ?? new UnavailableNotificationRepositoryAdapter();
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.stateCommands = stateCommands;
  }

  @Get()
  @ApiOperation({
    summary: 'List content-safe notifications for the authenticated workspace actor',
  })
  @ApiOkResponse({
    description: 'A cursor page with an authoritative unread count.',
    schema: { $ref: '#/components/schemas/DdaNotificationPage' },
  })
  @ApiBadRequestResponse({ description: 'Invalid limit, cursor, or client authority field.' })
  @ApiForbiddenResponse({ description: 'The authenticated actor lacks workspace scope.' })
  @ApiServiceUnavailableResponse({
    description: 'Committed notification persistence is unavailable.',
  })
  async list(
    @Req() request: unknown,
    @Query() query: NotificationListQueryDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<DdaNotificationPage> {
    rejectClientAuthority(request, query);
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      return mapContextError(error);
    }
    if (context.tenantScope.scopeType !== 'workspace') throw new ForbiddenException('HTTP_403');
    const cursor = parseCursor(query?.cursor);
    const limit = parseLimit(query?.limit);
    let result;
    try {
      result = await this.repository.list(context, {
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
    } catch {
      http(HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!result.accepted) {
      const status = resultStatus(result.code);
      setReplyStatus(reply, status);
      http(status);
    }
    return result.value;
  }

  @Patch(':notificationId')
  @ApiOperation({ summary: 'Update one authenticated actor notification state' })
  @ApiBody({ schema: { $ref: '#/components/schemas/DdaNotificationStateCommand' } })
  @ApiOkResponse({
    description: 'The updated notification.',
    schema: { $ref: '#/components/schemas/DdaNotification' },
  })
  @applyNotificationMutationResponses()
  async setState(
    @Req() request: unknown,
    @Param('notificationId') notificationId: string,
    @Body() input: NotificationStateCommandDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<DdaNotification> {
    rejectClientAuthority(request, input);
    if (!parseStableIdentifierV1(notificationId).accepted)
      throw new BadRequestException('HTTP_400');
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      return mapContextError(error);
    }
    if (context.tenantScope.scopeType !== 'workspace') throw new ForbiddenException('HTTP_403');
    const parsedCommand = parseV3Contract<DdaNotificationStateCommand>(
      STATE_COMMAND_SCHEMA_ID,
      input,
    );
    if (!parsedCommand.accepted) throw new BadRequestException('HTTP_400');
    const targetStateValue = parsedCommand.value.state;
    let typedTargetState: Exclude<NotificationStateV1, 'UNREAD'>;
    switch (targetStateValue) {
      case 'READ':
      case 'ARCHIVED':
      case 'DISMISSED':
        typedTargetState = targetStateValue;
        break;
      default:
        throw new BadRequestException('HTTP_400');
    }
    const commandPort =
      this.stateCommands ??
      (typeof (this.repository as Partial<NotificationStateCommandPortV1>).setStateCommand ===
      'function'
        ? (this.repository as unknown as NotificationStateCommandPortV1)
        : undefined);
    let result;
    try {
      result =
        commandPort === undefined
          ? await this.repository.setState(context, {
              notificationId,
              state: typedTargetState,
              expectedRevision: parsedCommand.value.expectedRevision,
              idempotencyKey: parsedCommand.value.idempotencyKey,
            })
          : await commandPort.setStateCommand({
              context,
              notificationId,
              targetState: typedTargetState,
              expectedRevision: parsedCommand.value.expectedRevision,
              idempotencyKey: parsedCommand.value.idempotencyKey,
              fingerprint: fingerprintNotificationStateCommandV1({
                context,
                notificationId,
                targetState: typedTargetState,
                expectedRevision: parsedCommand.value.expectedRevision,
                idempotencyKey: parsedCommand.value.idempotencyKey,
              }),
            });
    } catch {
      http(HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!result.accepted) {
      const status = resultStatus(result.code);
      setReplyStatus(reply, status);
      http(status);
    }
    return result.value;
  }
}

function applyNotificationMutationResponses(): MethodDecorator {
  return applyDecorators(
    ApiBadRequestResponse({ description: 'The notification command is invalid.' }),
    ApiConflictResponse({ description: 'The notification revision conflicts.' }),
    ApiNotFoundResponse({ description: 'The notification is not visible.' }),
    ApiServiceUnavailableResponse({ description: 'Notification persistence is unavailable.' }),
  );
}
