import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import {
  parseV4Contract,
  type IamProfileUpdateAccepted,
  type IamProfileUpdateCommand,
} from '@databreeze/contracts/v4';

import { IAM_PROFILE_MUTATION_SERVICE } from '../application/profile-mutation.port.js';
import { ProfileMutationService } from '../application/profile-mutation.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

const COMMAND_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/iam-profile-update-command' as const;
const ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/iam-profile-update-accepted' as const;

export class ProfileUpdateCommandDto implements IamProfileUpdateCommand {
  @ApiProperty({ enum: [4] })
  @IsInt()
  @Min(4)
  @Max(4)
  schemaVersion!: 4;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: ['vi-VN', 'en'] })
  @IsIn(['vi-VN', 'en'])
  locale!: 'vi-VN' | 'en';

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class ProfileUpdateAcceptedDto implements IamProfileUpdateAccepted {
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty({ type: Object })
  user!: IamProfileUpdateAccepted['user'];
}

function rejectAuthority(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, child]) =>
    [
      'actorId',
      'userId',
      'tenantScope',
      'organizationId',
      'workspaceId',
      'projectId',
      'role',
    ].includes(key)
      ? true
      : rejectAuthority(child, seen),
  );
}

function statusFor(code: string): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return HttpStatus.FORBIDDEN;
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'REVISION_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return HttpStatus.CONFLICT;
    case 'UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1/me')
export class ProfileController {
  public constructor(
    @Optional()
    @Inject(IAM_PROFILE_MUTATION_SERVICE)
    private readonly profile: ProfileMutationService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Patch('profile')
  @ApiOperation({ summary: 'Update the authenticated user profile preferences' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–200 characters.' })
  @ApiOkResponse({ type: ProfileUpdateAcceptedDto })
  @ApiBadRequestResponse({ description: 'Invalid profile command.' })
  @ApiForbiddenResponse({ description: 'The authenticated profile cannot be changed.' })
  @ApiNotFoundResponse({ description: 'The authenticated user was not found.' })
  @ApiConflictResponse({ description: 'The profile revision or idempotency key conflicts.' })
  @ApiServiceUnavailableResponse({ description: 'Profile persistence is unavailable.' })
  async update(
    @Req() request: unknown,
    @Body() body: ProfileUpdateCommandDto,
  ): Promise<IamProfileUpdateAccepted> {
    const requestRecord =
      typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {};
    if (rejectAuthority(body) || rejectAuthority(requestRecord['body']))
      throw new HttpException('HTTP_400', HttpStatus.BAD_REQUEST);
    if (this.profile === undefined)
      throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'AUTHENTICATION_FAILED')
          throw new HttpException('HTTP_401', HttpStatus.UNAUTHORIZED);
        throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const headers = requestRecord['headers'];
    const idempotencyKey =
      typeof headers === 'object' && headers !== null
        ? ((headers as Record<string, unknown>)['idempotency-key'] ??
          (headers as Record<string, unknown>)['Idempotency-Key'])
        : undefined;
    const parsed = parseV4Contract<IamProfileUpdateCommand>(COMMAND_SCHEMA_ID, body);
    if (!parsed.accepted) throw new HttpException('HTTP_400', HttpStatus.BAD_REQUEST);
    const result = await this.profile.update({
      actorId: context.actorId,
      displayName: parsed.value.displayName,
      locale: parsed.value.locale,
      expectedRevision: parsed.value.expectedRevision,
      idempotencyKey,
    });
    if (!result.accepted) throw new HttpException(`PROFILE_${result.code}`, statusFor(result.code));
    const response: IamProfileUpdateAccepted = {
      schemaVersion: 4,
      user: {
        id: result.value.userId,
        displayName: result.value.displayName,
        locale: result.value.locale,
        revision: result.value.revision,
      },
    };
    const validated = parseV4Contract<IamProfileUpdateAccepted>(ACCEPTED_SCHEMA_ID, response);
    if (!validated.accepted) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    return validated.value;
  }
}
