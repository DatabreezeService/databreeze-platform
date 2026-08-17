import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import {
  DataImportServiceV1,
  type DataImportProblemCodeV1,
} from '../application/data-import.service.js';

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'organizationId',
  'orgId',
  'workspaceId',
  'projectId',
  'actor',
  'actorId',
  'memberId',
  'role',
  'authorized',
  'authorization',
]);

function hasAuthority(value: unknown, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasAuthority(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasAuthority(child, depth + 1),
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value)
  );
}

function base64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 700_000 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  );
}

function decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function id(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function status(code: DataImportProblemCodeV1): HttpStatus {
  switch (code) {
    case 'DDA_IMPORT_NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'DDA_IMPORT_UNAUTHORIZED':
      return HttpStatus.FORBIDDEN;
    case 'DDA_IMPORT_CONFLICT':
    case 'DDA_IMPORT_REVISION_CONFLICT':
      return HttpStatus.CONFLICT;
    case 'DDA_IMPORT_INVALID':
    case 'DDA_IMPORT_REVIEW_REQUIRED':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function throwProblem(code: DataImportProblemCodeV1): never {
  throw new HttpException(
    Object.freeze({ error: 'DDA_IMPORT_REJECTED', code }),
    status(code),
  );
}

/** WEB-021/DDA-053: server-owned multi-file import review state machine. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/data-imports')
export class DataImportController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly service: DataImportServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post()
  public async create(@Req() request: unknown, @Body() body: unknown) {
    this.rejectAuthority(body, request);
    if (!record(body)) throw new BadRequestException();
    const destination = body['destination'];
    if (
      !record(destination) ||
      !['NEW_DATASET', 'EXISTING_DATASET'].includes(String(destination['kind'])) ||
      !text(body['datasetName'], 200) ||
      !text(body['idempotencyKey'], 200) ||
      !Array.isArray(body['files']) ||
      body['files'].length < 1 ||
      body['files'].length > 8
    )
      throw new BadRequestException();
    const datasetId = destination['datasetId'];
    if (destination['kind'] === 'EXISTING_DATASET' && !id(datasetId))
      throw new BadRequestException();
    const files = body['files'].map((candidate) => {
      if (
        !record(candidate) ||
        !text(candidate['fileName'], 255) ||
        !text(candidate['claimedMediaType'], 160) ||
        !base64(candidate['contentBase64'])
      )
        throw new BadRequestException();
      const bytes = decode(candidate['contentBase64']);
      if (bytes.length < 1 || bytes.length > 512_000) throw new BadRequestException();
      return {
        fileName: candidate['fileName'],
        claimedMediaType: candidate['claimedMediaType'],
        bytes,
      };
    });
    const context = await this.resolveContext(request);
    const result = await this.service.create({
      context,
      destination: destination['kind'] as 'NEW_DATASET' | 'EXISTING_DATASET',
      ...(datasetId === undefined ? {} : { datasetId: datasetId as string }),
      datasetName: body['datasetName'],
      idempotencyKey: body['idempotencyKey'],
      files,
    });
    if (!result.accepted) throwProblem(result.code);
    return Object.freeze({
      accepted: true,
      replayed: result.replayed ?? false,
      value: result.value,
    });
  }

  @Get()
  public async list(@Req() request: unknown, @Query('limit') limitInput?: string) {
    this.rejectAuthority(undefined, request);
    const context = await this.resolveContext(request);
    const limit = limitInput === undefined ? 20 : Number(limitInput);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new BadRequestException();
    return Object.freeze({
      accepted: true,
      value: Object.freeze({ imports: await this.service.list(context.tenantScope, limit) }),
    });
  }

  @Get(':importId')
  public async get(@Req() request: unknown, @Param('importId') importId: string) {
    this.rejectAuthority(undefined, request);
    if (!id(importId)) throw new BadRequestException();
    const context = await this.resolveContext(request);
    const result = await this.service.get(importId, context.tenantScope);
    if (!result.accepted) throwProblem(result.code);
    return result;
  }

  @Post(':importId/corrections')
  public async correction(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Body() body: unknown,
  ) {
    this.rejectAuthority(body, request);
    if (
      !id(importId) ||
      !record(body) ||
      !text(body['message'], 2_000) ||
      !Number.isSafeInteger(body['expectedRevision']) ||
      (body['fieldName'] !== undefined && !text(body['fieldName'], 128))
    )
      throw new BadRequestException();
    const context = await this.resolveContext(request);
    const result = await this.service.addCorrection({
      importId,
      context,
      expectedRevision: body['expectedRevision'] as number,
      message: body['message'],
      ...(body['fieldName'] === undefined ? {} : { fieldName: body['fieldName'] }),
    });
    if (!result.accepted) throwProblem(result.code);
    return result;
  }

  @Post(':importId/approve')
  public async approve(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Body() body: unknown,
  ) {
    this.rejectAuthority(body, request);
    if (
      !id(importId) ||
      !record(body) ||
      !Number.isSafeInteger(body['expectedRevision']) ||
      !text(body['idempotencyKey'], 200)
    )
      throw new BadRequestException();
    const context = await this.resolveContext(request);
    const result = await this.service.approve({
      importId,
      context,
      expectedRevision: body['expectedRevision'] as number,
      idempotencyKey: body['idempotencyKey'],
    });
    if (!result.accepted) throwProblem(result.code);
    return result;
  }

  private rejectAuthority(body: unknown, request: unknown): void {
    const requestRecord = record(request) ? request : undefined;
    if (
      hasAuthority(body) ||
      hasAuthority(requestRecord?.['body']) ||
      hasAuthority(requestRecord?.['query']) ||
      hasAuthority(requestRecord?.['params'])
    )
      throw new BadRequestException();
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
}
