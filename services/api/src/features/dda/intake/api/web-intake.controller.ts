import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaWebIntakeProfileV1,
  DdaIntakeProblemCodeV1,
} from '../application/intake-profile.port.js';
import { WebIntakeServiceV1 } from '../application/web-intake.service.js';
import { WebIntakeUploadDtoV1 } from './web-intake.dto.js';
import type {
  WebIntakeFinalizeDtoV1,
  WebIntakeFinalizeResponseDtoV1,
  WebIntakeUploadResponseDtoV1,
} from './web-intake.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'memberAuthorized',
  'actor',
  'actorId',
  'memberId',
  'organizationId',
  'orgId',
  'workspaceId',
  'projectId',
  'authorization',
  'authorized',
  'role',
]);
const SAFE_INTAKE_ERROR = Object.freeze({ error: 'DDA_INTAKE_REJECTED' });

function hasClientAuthorityField(value: unknown, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasClientAuthorityField(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthorityField(child, depth + 1),
  );
}

function isNonEmptyText(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 512 && !/\p{Cc}/u.test(value)
  );
}

function isStableIdentifier(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function decodeBase64(value: string): Buffer {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new BadRequestException();
  }
  return Buffer.from(value, 'base64');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intakeProblemStatus(code: DdaIntakeProblemCodeV1): HttpStatus {
  if (
    code === 'DDA_INTAKE_DUPLICATE_FINALIZATION' ||
    code === 'DDA_INTAKE_LOCAL_IDEMPOTENCY_CONFLICT'
  )
    return HttpStatus.CONFLICT;
  if (code === 'DDA_INTAKE_LOCAL_PERMISSION_DENIED') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_INTAKE_LOCAL_POLICY_UNAVAILABLE' || code === 'DDA_INTAKE_LOCAL_UNAVAILABLE')
    return HttpStatus.SERVICE_UNAVAILABLE;
  if (
    code === 'DDA_INTAKE_UNSUPPORTED_PROFILE' ||
    code === 'DDA_INTAKE_UNSUPPORTED_ENCODING' ||
    code === 'DDA_INTAKE_MALFORMED_ENCODING'
  )
    return HttpStatus.BAD_REQUEST;
  return HttpStatus.UNPROCESSABLE_ENTITY;
}

function throwIntakeProblem(code: DdaIntakeProblemCodeV1): never {
  throw new HttpException(SAFE_INTAKE_ERROR, intakeProblemStatus(code));
}

/** DDA-002: Web intake control plane returns IDs/status only. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/web-intake')
export class WebIntakeController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly service: WebIntakeServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Get('profile')
  public async getProfile(): Promise<DdaWebIntakeProfileV1> {
    await Promise.resolve();
    return this.service.publishedProfile();
  }

  @Post('finalize')
  public async finalize(
    @Req() request: unknown,
    @Body() dto: WebIntakeFinalizeDtoV1,
  ): Promise<WebIntakeFinalizeResponseDtoV1> {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isStableIdentifier(dto.sessionId) ||
      !isNonEmptyText(dto.fileName) ||
      !isNonEmptyText(dto.claimedMediaType) ||
      !isHash(dto.expectedSha256) ||
      !isNonEmptyText(dto.contentBase64) ||
      (dto.declaredEncoding !== undefined && !isNonEmptyText(dto.declaredEncoding))
    ) {
      throw new BadRequestException();
    }

    const context = await this.resolveContext(request);
    const bytes = decodeBase64(dto.contentBase64);
    let result: Awaited<ReturnType<WebIntakeServiceV1['finalizeUpload']>>;
    try {
      const serviceInput = {
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        sessionId: dto.sessionId,
        fileName: dto.fileName,
        claimedMediaType: dto.claimedMediaType,
        expectedSha256: dto.expectedSha256,
        bytes,
        ...(dto.declaredEncoding === undefined ? {} : { declaredEncoding: dto.declaredEncoding }),
      };
      result = await this.service.finalizeUpload(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwIntakeProblem(result.code);
    return {
      accepted: true,
      sessionId: result.value.sessionId,
      artifactVersionId: result.value.artifactVersionId,
      status: result.value.status,
      profileId: result.value.profileId,
    };
  }

  @Post('upload')
  public async upload(
    @Req() request: unknown,
    @Body() dto: WebIntakeUploadDtoV1,
  ): Promise<WebIntakeUploadResponseDtoV1> {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isNonEmptyText(dto.fileName) ||
      !isNonEmptyText(dto.claimedMediaType) ||
      !isHash(dto.expectedSha256) ||
      !isNonEmptyText(dto.contentBase64) ||
      !isNonEmptyText(dto.idempotencyKey) ||
      (dto.declaredEncoding !== undefined && !isNonEmptyText(dto.declaredEncoding))
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    const bytes = decodeBase64(dto.contentBase64);
    try {
      const result = await this.service.uploadFile(
        {
          tenantScope: context.tenantScope,
          fileName: dto.fileName,
          claimedMediaType: dto.claimedMediaType,
          expectedSha256: dto.expectedSha256,
          bytes,
          idempotencyKey: dto.idempotencyKey,
          ...(dto.declaredEncoding === undefined ? {} : { declaredEncoding: dto.declaredEncoding }),
        },
        context,
      );
      if (!result.accepted) throwIntakeProblem(result.code);
      return {
        accepted: true,
        sessionId: result.value.sessionId,
        artifactVersionId: result.value.artifactVersionId,
        status: result.value.status,
        profileId: result.value.profileId,
        replayed: result.value.replayed,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  private rejectClientAuthority(body: unknown, request: unknown): void {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasClientAuthorityField(body) ||
      hasClientAuthorityField(requestRecord?.['body']) ||
      hasClientAuthorityField(requestRecord?.['query']) ||
      hasClientAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
  }
}
