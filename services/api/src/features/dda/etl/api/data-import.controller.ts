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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { parseV4Contract, type DdaDataImportDashboardPreview } from '@databreeze/contracts/v4';

import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import {
  DataImportServiceV1,
  type DataImportDeclaredEncodingV1,
  type DataImportDashboardPreviewV1,
  type DataImportProblemCodeV1,
} from '../application/data-import.service.js';
import { DDA_WEB_INTAKE_PROFILE_V1 } from '../../intake/application/intake-profile.port.js';

const DASHBOARD_PREVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'accepted', 'value'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    accepted: { type: 'boolean', enum: [true] },
    value: { type: 'object', additionalProperties: true },
  },
};

const MAPPING_SUGGESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['accepted', 'value'],
  properties: {
    accepted: { type: 'boolean', enum: [true] },
    value: {
      type: 'object',
      additionalProperties: false,
      required: [
        'importId',
        'revision',
        'suggestions',
        'adapterUsed',
        'authoritative',
        'generatedAt',
      ],
      properties: {
        importId: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 1 },
        adapterUsed: { type: 'boolean' },
        authoritative: { type: 'boolean', enum: [false] },
        generatedAt: { type: 'string', format: 'date-time' },
        suggestions: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'label',
              'summary',
              'sourceField',
              'targetField',
              'transformKind',
              'alternatives',
              'rationale',
              'uncertainty',
              'authoritative',
            ],
            properties: {
              label: { type: 'string', maxLength: 128 },
              summary: { type: 'string', maxLength: 512 },
              sourceField: { type: 'string', maxLength: 128 },
              targetField: { type: 'string', maxLength: 128 },
              transformKind: { type: 'string', maxLength: 64 },
              alternatives: {
                type: 'array',
                maxItems: 5,
                items: { type: 'string', maxLength: 128 },
              },
              rationale: { type: 'string', maxLength: 512 },
              uncertainty: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              authoritative: { type: 'boolean', enum: [false] },
            },
          },
        },
      },
    },
  },
};

const MAX_DATA_IMPORT_FILE_BYTES = 100 * 1024 * 1024;

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
    value.length <= 150_000_000 &&
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
    case 'AI_EGRESS_DENIED':
    case 'PURPOSE_DENIED':
      return HttpStatus.FORBIDDEN;
    case 'SAMPLE_PERMISSION_DENIED':
    case 'PAYLOAD_TOO_LARGE':
    case 'HOSTILE_CONTENT_REJECTED':
    case 'INVALID_SUGGESTION':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'BUDGET_DENIED':
      return HttpStatus.TOO_MANY_REQUESTS;
    case 'DDA_IMPORT_INVALID':
    case 'DDA_IMPORT_REVIEW_REQUIRED':
    case 'DDA_INTAKE_LIMIT_SIZE':
    case 'DDA_INTAKE_LIMIT_ROWS':
    case 'DDA_INTAKE_LIMIT_COLUMNS':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'DDA_INTAKE_MALFORMED_ENCODING':
    case 'DDA_INTAKE_UNSUPPORTED_ENCODING':
      return HttpStatus.BAD_REQUEST;
    default:
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function throwProblem(code: DataImportProblemCodeV1): never {
  throw new HttpException(Object.freeze({ error: 'DDA_IMPORT_REJECTED', code }), status(code));
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
      if (bytes.length < 1) throw new BadRequestException();
      if (bytes.length > MAX_DATA_IMPORT_FILE_BYTES) throwProblem('DDA_INTAKE_LIMIT_SIZE');
      const declaredEncoding = candidate['declaredEncoding'];
      if (
        declaredEncoding !== undefined &&
        (typeof declaredEncoding !== 'string' ||
          !DDA_WEB_INTAKE_PROFILE_V1.csv.encodings.includes(declaredEncoding))
      ) {
        throwProblem('DDA_INTAKE_UNSUPPORTED_ENCODING');
      }
      return {
        fileName: candidate['fileName'],
        claimedMediaType: candidate['claimedMediaType'],
        bytes,
        ...(declaredEncoding === undefined
          ? {}
          : { declaredEncoding: declaredEncoding as DataImportDeclaredEncodingV1 }),
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

  @Get(':importId/dashboard-preview')
  @ApiOkResponse({ schema: DASHBOARD_PREVIEW_SCHEMA })
  public async dashboardPreview(
    @Req() request: unknown,
    @Param('importId') importId: string,
  ): Promise<DdaDataImportDashboardPreview> {
    this.rejectAuthority(undefined, request);
    if (!id(importId)) throw new BadRequestException();
    const context = await this.resolveContext(request);
    const result = await this.service.dashboardPreview({ importId, context });
    if (!result.accepted) throwProblem(result.code);
    const sampleRows = result.value.sampleRows.map((row) =>
      Object.freeze({
        cells: Object.freeze(
          Object.entries(row).map(([field, value]) =>
            Object.freeze({
              field,
              value: value === null ? '' : String(value),
              kind:
                value === null
                  ? ('EMPTY' as const)
                  : typeof value === 'number'
                    ? ('NUMBER' as const)
                    : typeof value === 'boolean'
                      ? ('BOOLEAN' as const)
                      : ('TEXT' as const),
            }),
          ),
        ),
      }),
    );
    const candidate = Object.freeze({
      schemaVersion: 4 as const,
      accepted: true as const,
      value: Object.freeze({
        ...result.value,
        sampleRows: Object.freeze(sampleRows),
      }) as unknown as DataImportDashboardPreviewV1,
    });
    const parsed = parseV4Contract<DdaDataImportDashboardPreview>(
      'https://schemas.databreeze.dev/contracts/v4/dda-data-import-dashboard-preview',
      candidate,
    );
    if (!parsed.accepted) throw new ServiceUnavailableException();
    return parsed.value;
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

  /**
   * Explicitly request advisory mapping suggestions for the persisted review.
   * The only browser authority is sample consent; tenant, fields, and samples
   * are resolved from the authenticated import record on the server.
   */
  @Post(':importId/mapping-suggestions')
  @ApiOkResponse({ schema: MAPPING_SUGGESTIONS_SCHEMA })
  public async mappingSuggestions(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Body() body: unknown,
  ) {
    this.rejectAuthority(body, request);
    if (
      !id(importId) ||
      !record(body) ||
      typeof body['samplePermissionGranted'] !== 'boolean' ||
      (body['locale'] !== undefined && body['locale'] !== 'vi' && body['locale'] !== 'en')
    )
      throw new BadRequestException();
    const context = await this.resolveContext(request);
    const result = await this.service.mappingSuggestions({
      importId,
      context,
      samplePermissionGranted: body['samplePermissionGranted'],
      locale: body['locale'] === 'en' ? 'en' : 'vi',
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
